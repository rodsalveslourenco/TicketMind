import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHistoryEntry, isOpenTicketStatus, normalizeText } from "../src/data/helpdesk.js";
import { hasAnyPermission } from "../src/data/permissions.js";
import { insertSystemLog, readState, readUserByEmail, readUserById, sanitizeSessionUser, updateUserPassword, writeState } from "./db.js";
import {
  mergeIncomingState,
  prepareStateForClient,
  processRecurringApprovalReminders,
  processTicketNotifications,
  sendPasswordRecoveryEmail,
  sendNotificationTest,
} from "./notifications.js";
import {
  clearSessionCookie,
  createSessionCookie,
  createPasswordResetToken,
  createSessionToken,
  getPasswordFingerprint,
  getSessionTokenFromRequest,
  hashPassword,
  needsPasswordUpgrade,
  verifyPasswordResetToken,
  verifyPassword,
  verifySessionToken,
} from "./security.js";
import { buildActorFromUser, collectStateAuditLogs, createSystemLog, getRequestOrigin } from "./systemLogs.js";
import { createV1Router } from "./api/routes/v1.js";
import { buildEnvelope } from "./api/envelope.js";
import * as stateRepository from "./repositories/stateRepository.js";
import { createStateService } from "./services/stateService.js";
import { createTicketService } from "./services/ticketService.js";
import { createCollectionService } from "./services/collectionService.js";
import { buildPublicIntakeBootstrap, createPublicTicket, getPublicIntakeConfig, isValidPublicIntakeToken } from "./publicIntake.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT || 3001);
const distPath = path.resolve(__dirname, "..", "dist");
const stateService = createStateService({ stateRepository });
const ticketService = createTicketService({ stateService });
const collectionService = createCollectionService({ stateService });
const approvalReminderPollMs = Math.max(60 * 1000, Number(process.env.APPROVAL_REMINDER_POLL_MS) || 5 * 60 * 1000);
let approvalReminderTimer = null;
let escalationTimer = null;

app.use(express.json({ limit: "15mb" }));

function handleAsync(handler) {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

function isDatabaseConnectionError(error) {
  const code = String(error?.code || "").trim().toUpperCase();
  const message = String(error?.message || "").trim().toLowerCase();
  return (
    ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "57P01", "57P02", "57P03"].includes(code) ||
    message.includes("connection terminated unexpectedly") ||
    message.includes("connect econnrefused")
  );
}

function isActiveUser(user) {
  return String(user?.status || "Ativo").trim().toLowerCase() === "ativo";
}

function toIsoDateOrEmpty(value, { endOfDay = false } = {}) {
  const trimmedValue = String(value || "").trim();
  if (!trimmedValue) return "";
  const parsed = new Date(endOfDay ? `${trimmedValue}T23:59:59.999` : trimmedValue);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

function normalizeValue(value) {
  return JSON.stringify(value ?? null);
}

function validateNextPassword(password) {
  const normalizedPassword = String(password || "");
  if (normalizedPassword.length < 8) {
    return "A nova senha precisa ter pelo menos 8 caracteres.";
  }
  if (!/[a-z]/i.test(normalizedPassword) || !/\d/.test(normalizedPassword)) {
    return "A nova senha precisa combinar letras e numeros.";
  }
  return "";
}

function buildPublicAppUrl(request, pathName = "") {
  const configuredBaseUrl = String(process.env.APP_PUBLIC_URL || "").trim().replace(/\/+$/, "");
  const normalizedPath = String(pathName || "").trim();
  if (configuredBaseUrl) {
    return normalizedPath ? `${configuredBaseUrl}${normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`}` : configuredBaseUrl;
  }

  const forwardedProto = String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const protocol = forwardedProto || request.protocol || "http";
  const host = String(request.headers["x-forwarded-host"] || request.headers.host || "").split(",")[0].trim();
  if (!host) return "";
  return `${protocol}://${host}${normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`}`;
}

function buildPublicHashUrl(request, hashPath = "") {
  const appBaseUrl = buildPublicAppUrl(request, "");
  const normalizedHashPath = String(hashPath || "").trim().replace(/^#?\/?/, "");
  if (!appBaseUrl) return "";
  return normalizedHashPath ? `${appBaseUrl}/#/${normalizedHashPath}` : `${appBaseUrl}/#/`;
}

function mapById(items = []) {
  return new Map((Array.isArray(items) ? items : []).filter(Boolean).map((item) => [String(item.id || "").trim(), item]));
}

function summarizeCriticalStateChanges(previousState = {}, nextState = {}) {
  const changes = [];
  const push = (change) => changes.push(change);
  const previousUsers = mapById(previousState.users || []);
  const nextUsers = mapById(nextState.users || []);

  for (const [userId, nextUser] of nextUsers.entries()) {
    const previousUser = previousUsers.get(userId);
    if (!previousUser) {
      push({ kind: "user_create", targetId: userId, label: nextUser.email || nextUser.name || userId });
      continue;
    }

    if (
      previousUser.name !== nextUser.name ||
      previousUser.email !== nextUser.email ||
      previousUser.role !== nextUser.role ||
      previousUser.team !== nextUser.team ||
      previousUser.departmentId !== nextUser.departmentId ||
      previousUser.department !== nextUser.department
    ) {
      push({ kind: "user_update", targetId: userId, label: nextUser.email || nextUser.name || userId });
    }

    if (String(previousUser.status || "") !== String(nextUser.status || "")) {
      push({ kind: "user_status", targetId: userId, label: nextUser.email || nextUser.name || userId });
    }

    if (String(previousUser.password || "") !== String(nextUser.password || "")) {
      push({ kind: "user_password", targetId: userId, label: nextUser.email || nextUser.name || userId });
    }

    if (Boolean(previousUser.mustChangePassword) !== Boolean(nextUser.mustChangePassword)) {
      push({ kind: "user_password", targetId: userId, label: nextUser.email || nextUser.name || userId });
    }

    if (
      String(previousUser.permissionProfileId || "") !== String(nextUser.permissionProfileId || "") ||
      normalizeValue(previousUser.permissions || {}) !== normalizeValue(nextUser.permissions || {}) ||
      normalizeValue(previousUser.additionalPermissions || {}) !== normalizeValue(nextUser.additionalPermissions || {}) ||
      normalizeValue(previousUser.restrictedPermissions || {}) !== normalizeValue(nextUser.restrictedPermissions || {})
    ) {
      push({ kind: "user_permissions", targetId: userId, label: nextUser.email || nextUser.name || userId });
    }
  }

  for (const [userId, previousUser] of previousUsers.entries()) {
    if (!nextUsers.has(userId)) {
      push({ kind: "user_delete", targetId: userId, label: previousUser.email || previousUser.name || userId });
    }
  }

  const registerIfChanged = (kind, previousValue, nextValue) => {
    if (normalizeValue(previousValue) !== normalizeValue(nextValue)) {
      push({ kind });
    }
  };

  registerIfChanged("permission_profiles_manage", previousState.permissionProfiles, nextState.permissionProfiles);
  registerIfChanged("departments_manage", previousState.departments, nextState.departments);
  registerIfChanged("locations_manage", previousState.locations, nextState.locations);
  registerIfChanged("service_center_manage", previousState.serviceCenter, nextState.serviceCenter);
  registerIfChanged("navigation_manage", previousState.navigationSections, nextState.navigationSections);
  registerIfChanged("notification_rules_manage", previousState.notificationRules, nextState.notificationRules);
  registerIfChanged("email_layouts_manage", previousState.emailLayouts, nextState.emailLayouts);
  registerIfChanged("smtp_manage", previousState.smtpSettings, nextState.smtpSettings);
  registerIfChanged("email_service_manage", previousState.emailServiceSettings, nextState.emailServiceSettings);
  registerIfChanged("api_configs_manage", previousState.apiConfigs, nextState.apiConfigs);

  return changes;
}

function isAllowedCriticalChange(user, change) {
  switch (change.kind) {
    case "user_create":
      return hasAnyPermission(user, ["users_create", "users_admin"]);
    case "user_update":
      return hasAnyPermission(user, ["users_edit", "users_admin"]);
    case "user_status":
    case "user_password":
      return hasAnyPermission(user, ["users_reset_password", "users_admin"]);
    case "user_permissions":
    case "permission_profiles_manage":
    case "navigation_manage":
      return hasAnyPermission(user, ["users_manage_permissions", "users_admin"]);
    case "email_layouts_manage":
      return hasAnyPermission(user, ["email_layouts_manage", "users_manage_permissions", "users_admin"]);
    case "email_service_manage":
    case "notification_rules_manage":
      return hasAnyPermission(user, ["notifications_manage", "service_center_manage", "users_manage_permissions", "users_admin"]);
    case "user_delete":
      return hasAnyPermission(user, ["users_delete", "users_admin"]);
    case "departments_manage":
      return hasAnyPermission(user, ["service_center_departments_manage", "service_center_manage", "users_admin"]);
    case "locations_manage":
      return hasAnyPermission(user, ["service_center_departments_manage", "service_center_manage", "users_admin"]);
    case "service_center_manage":
    case "smtp_manage":
      return hasAnyPermission(user, ["notifications_manage", "service_center_manage", "users_manage_permissions", "users_admin"]);
    case "api_configs_manage":
      return hasAnyPermission(user, ["api_rest_configure_integrations", "api_rest_admin", "users_admin"]);
    default:
      return true;
  }
}

function protectIncomingUsers(previousState = {}, nextState = {}) {
  const previousUsersById = mapById(previousState.users || []);
  const nextUsers = Array.isArray(nextState.users) ? nextState.users : [];
  return nextUsers.map((candidate) => {
    const nextUser = candidate && typeof candidate === "object" ? { ...candidate } : candidate;
    if (!nextUser || typeof nextUser !== "object") return nextUser;

    const previousUser = previousUsersById.get(String(nextUser.id || "").trim()) || null;
    const nextPassword = String(nextUser.password || "");
    const nextPasswordReveal = String(nextUser.passwordReveal || nextPassword || "");

    if (previousUser) {
      const previousMustChangePassword = Boolean(previousUser.mustChangePassword);
      if (!nextPassword.trim()) {
        return {
          ...nextUser,
          password: previousUser.password || "",
          passwordReveal: previousUser.passwordReveal || "",
          mustChangePassword: Boolean(nextUser.mustChangePassword ?? previousMustChangePassword),
        };
      }
      if (
        nextPassword === String(previousUser.password || "") ||
        nextPasswordReveal === String(previousUser.passwordReveal || "")
      ) {
        return {
          ...nextUser,
          password: previousUser.password || "",
          passwordReveal: previousUser.passwordReveal || "",
          mustChangePassword: Boolean(nextUser.mustChangePassword ?? previousMustChangePassword),
        };
      }
      return {
        ...nextUser,
        password: hashPassword(nextPassword),
        passwordReveal: nextPasswordReveal,
        mustChangePassword: Boolean(nextUser.mustChangePassword),
      };
    }

    return {
      ...nextUser,
      password: nextPassword.trim() ? hashPassword(nextPassword) : "",
      passwordReveal: nextPasswordReveal,
      mustChangePassword: Boolean(nextUser.mustChangePassword),
    };
  });
}

function applyServerStateProtections(previousState = {}, nextState = {}) {
  return {
    ...nextState,
    users: protectIncomingUsers(previousState, nextState),
  };
}

function buildAdministrativeAuditLogs(changes = [], actor = {}, origin = "") {
  if (!changes.length) return [];
  return [
    createSystemLog({
      ...actor,
      module: "administracao",
      eventType: "configuracao",
      description: `Operacao administrativa executada com ${changes.length} alteracao(oes) critica(s).`,
      origin,
      status: changes.some((change) => String(change.kind || "").includes("permissions") || String(change.kind || "").includes("password")) ? "alerta" : "sucesso",
      metadata: { changes },
    }),
  ];
}

async function persistStateChange(request, response, auth, nextState) {
  const previousState = auth?.state || (await readState());
  const protectedState = applyServerStateProtections(previousState, nextState);
  const criticalChanges = summarizeCriticalStateChanges(previousState, protectedState);
  const deniedChanges = criticalChanges.filter((change) => !isAllowedCriticalChange(auth.requestUser, change));

  if (deniedChanges.length) {
    await insertSystemLog(
      createSystemLog({
        ...buildActorFromUser(auth.requestUser),
        module: "administracao",
        eventType: "permissao",
        description: `Operacao critica bloqueada para ${auth.requestUser.name}.`,
        origin: getRequestOrigin(request),
        status: "erro",
        metadata: {
          route: request.originalUrl,
          method: request.method,
          deniedChanges,
        },
      }),
    );
    response.status(403).json({ error: "Voce nao possui permissao para executar uma ou mais alteracoes criticas." });
    return null;
  }

  const persistedState = await writeState(protectedState);
  const actor = buildActorFromUser(auth.requestUser);
  const auditLogs = collectStateAuditLogs(previousState, persistedState, actor, getRequestOrigin(request));
  const administrativeLogs = buildAdministrativeAuditLogs(criticalChanges, actor, getRequestOrigin(request));
  await Promise.all([...auditLogs, ...administrativeLogs].map((entry) => insertSystemLog(entry)));

  void processTicketNotifications({
    previousState,
    nextState: persistedState,
    persistState: writeState,
    baseUrl: process.env.APP_PUBLIC_URL || "",
  }).catch((error) => {
    console.error("notification processing failed", error);
  });

  return persistedState;
}

async function denyRequest(request, response, statusCode, message, metadata = {}, requestUser = null) {
  await insertSystemLog(
    createSystemLog({
      ...buildActorFromUser(requestUser, { userName: statusCode === 401 ? "Sessao invalida" : "Acesso nao autorizado" }),
      module: "seguranca",
      eventType: statusCode === 401 ? "sessao" : "permissao",
      description: message,
      origin: getRequestOrigin(request),
      status: "erro",
      metadata,
    }),
  );
  response.setHeader("Set-Cookie", clearSessionCookie());
  response.status(statusCode).json({ error: message });
  return null;
}

async function requireAuthenticatedUser(request, response, stateOverride = null) {
  const token = getSessionTokenFromRequest(request);
  if (!token) {
    return denyRequest(request, response, 401, "Sessao expirada ou inexistente.", {
      route: request.originalUrl,
      method: request.method,
      reason: "missing_token",
    });
  }

  const session = verifySessionToken(token);
  if (!session?.userId) {
    return denyRequest(request, response, 401, "Sessao invalida. Faca login novamente.", {
      route: request.originalUrl,
      method: request.method,
      reason: "invalid_token",
    });
  }

  const state = stateOverride || (await readState());
  const requestUser = (state.users || []).find((candidate) => candidate.id === session.userId) || null;

  if (!requestUser) {
    return denyRequest(request, response, 401, "Usuario da sessao nao foi encontrado.", {
      route: request.originalUrl,
      method: request.method,
      reason: "user_not_found",
      userId: session.userId,
    });
  }

  if (!isActiveUser(requestUser)) {
    return denyRequest(request, response, 403, "Usuario inativo.", {
      route: request.originalUrl,
      method: request.method,
      reason: "user_inactive",
      userId: requestUser.id,
    }, requestUser);
  }

  if (session.passwordFingerprint !== getPasswordFingerprint(requestUser.password || "")) {
    return denyRequest(request, response, 401, "Sessao invalidada por alteracao de credenciais.", {
      route: request.originalUrl,
      method: request.method,
      reason: "password_changed",
      userId: requestUser.id,
    }, requestUser);
  }

  return { state, requestUser, session };
}

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, apiVersion: "v1" });
});

app.post("/api/auth/login", handleAsync(async (request, response) => {
  const { email, password } = request.body || {};
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedPassword = String(password || "");

  if (!normalizedEmail || !normalizedPassword) {
    response.status(400).json({ error: "Preencha email e senha para continuar." });
    return;
  }

  const user = await readUserByEmail(normalizedEmail);
  const passwordMatches = user ? verifyPassword(normalizedPassword, user.password || "") : false;

  if (!user || !passwordMatches || !isActiveUser(user)) {
    await insertSystemLog(
      createSystemLog({
        userName: normalizedEmail || "Login sem email",
        userDepartment: "",
        module: "autenticacao",
        eventType: "login",
        description: `Falha de login para ${normalizedEmail || "email nao informado"}.`,
        origin: getRequestOrigin(request),
        status: "erro",
        metadata: {
          email: normalizedEmail,
          reason: user && !isActiveUser(user) ? "user_inactive" : "invalid_credentials",
        },
      }),
    );
    response.status(401).json({ error: user && !isActiveUser(user) ? "Usuario inativo." : "Credenciais invalidas." });
    return;
  }

  let authenticatedUser = user;
  if (needsPasswordUpgrade(user.password || "")) {
    const upgradedPassword = hashPassword(normalizedPassword);
    await updateUserPassword(user.id, upgradedPassword, { passwordReveal: normalizedPassword });
    authenticatedUser = { ...user, password: upgradedPassword, passwordReveal: normalizedPassword };
    await insertSystemLog(
      createSystemLog({
        ...buildActorFromUser(authenticatedUser),
        module: "administracao",
        eventType: "configuracao",
        description: `Credencial migrada para hash seguro para ${authenticatedUser.name}.`,
        origin: getRequestOrigin(request),
        status: "alerta",
        metadata: { userId: authenticatedUser.id, email: authenticatedUser.email, action: "password_hash_upgrade" },
      }),
    );
  }

  const { token, expiresAt } = createSessionToken(authenticatedUser);
  response.setHeader("Set-Cookie", createSessionCookie(token, expiresAt));

  await insertSystemLog(
    createSystemLog({
      ...buildActorFromUser(authenticatedUser),
      module: "autenticacao",
      eventType: "login",
      description: `Login realizado por ${authenticatedUser.name}.`,
      origin: getRequestOrigin(request),
      status: "sucesso",
      metadata: { email: authenticatedUser.email, expiresAt },
    }),
  );

  response.json({ user: sanitizeSessionUser(authenticatedUser), expiresAt });
}));

app.post("/api/auth/logout", handleAsync(async (request, response) => {
  const session = verifySessionToken(getSessionTokenFromRequest(request));

  response.setHeader("Set-Cookie", clearSessionCookie());

  if (!session?.userId) {
    response.status(204).end();
    return;
  }

  try {
    const requestUser = await readUserById(session.userId);

    if (requestUser) {
      await insertSystemLog(
        createSystemLog({
          ...buildActorFromUser(requestUser),
          module: "autenticacao",
          eventType: "logout",
          description: `Logout realizado por ${requestUser.name}.`,
          origin: getRequestOrigin(request),
          status: "sucesso",
          metadata: { userId: requestUser.id },
        }),
      );
    }
  } catch (error) {
    console.error("logout log skipped", error);
  }

  response.status(204).end();
}));

async function handleSessionRequest(request, response) {
  const token = getSessionTokenFromRequest(request);
  if (!token) {
    response.setHeader("Set-Cookie", clearSessionCookie());
    response.status(401).json({ error: "Sessao expirada ou inexistente." });
    return;
  }

  const session = verifySessionToken(token);
  if (!session?.userId) {
    response.setHeader("Set-Cookie", clearSessionCookie());
    response.status(401).json({ error: "Sessao invalida. Faca login novamente." });
    return;
  }

  const requestUser = await readUserById(session.userId);
  if (!requestUser || !isActiveUser(requestUser)) {
    response.setHeader("Set-Cookie", clearSessionCookie());
    response.status(401).json({ error: "Usuario da sessao nao foi encontrado." });
    return;
  }

  if (session.passwordFingerprint !== getPasswordFingerprint(requestUser.password || "")) {
    response.setHeader("Set-Cookie", clearSessionCookie());
    response.status(401).json({ error: "Sessao invalidada por alteracao de credenciais." });
    return;
  }

  response.json({ user: sanitizeSessionUser(requestUser), expiresAt: session.expiresAt });
}

app.get("/api/auth/session", handleAsync(handleSessionRequest));
app.get("/api/auth/session/:userId", handleAsync(handleSessionRequest));

app.post("/api/auth/change-password", handleAsync(async (request, response) => {
  const auth = await requireAuthenticatedUser(request, response);
  if (!auth) return;

  const currentPassword = String(request.body?.currentPassword || "");
  const nextPassword = String(request.body?.newPassword || "");

  if (!currentPassword || !nextPassword) {
    response.status(400).json({ error: "Informe a senha atual e a nova senha." });
    return;
  }

  if (!verifyPassword(currentPassword, auth.requestUser.password || "")) {
    response.status(400).json({ error: "A senha atual nao confere." });
    return;
  }

  if (verifyPassword(nextPassword, auth.requestUser.password || "")) {
    response.status(400).json({ error: "A nova senha precisa ser diferente da senha atual." });
    return;
  }

  const passwordValidationError = validateNextPassword(nextPassword);
  if (passwordValidationError) {
    response.status(400).json({ error: passwordValidationError });
    return;
  }

  const nextPasswordHash = hashPassword(nextPassword);
  await updateUserPassword(auth.requestUser.id, nextPasswordHash, { mustChangePassword: false, passwordReveal: nextPassword });
  const persistedUser = await readUserById(auth.requestUser.id);
  if (!persistedUser) {
    response.status(500).json({ error: "Nao foi possivel atualizar a senha." });
    return;
  }

  const { token, expiresAt } = createSessionToken(persistedUser);
  response.setHeader("Set-Cookie", createSessionCookie(token, expiresAt));

  await insertSystemLog(
    createSystemLog({
      ...buildActorFromUser(persistedUser),
      module: "autenticacao",
      eventType: "configuracao",
      description: `Senha alterada pelo proprio usuario ${persistedUser.name}.`,
      origin: getRequestOrigin(request),
      status: "sucesso",
      metadata: { action: "self_password_change" },
    }),
  );

  response.json({ user: sanitizeSessionUser(persistedUser), expiresAt });
}));

app.post("/api/auth/forgot-password", handleAsync(async (request, response) => {
  const normalizedEmail = String(request.body?.email || "").trim().toLowerCase();
  if (!normalizedEmail) {
    response.status(400).json({ error: "Informe o e-mail para recuperar a senha." });
    return;
  }

  const state = await readState();
  const account = (state.users || []).find((candidate) => String(candidate.email || "").trim().toLowerCase() === normalizedEmail) || null;
  const resetUrlBase = buildPublicAppUrl(request, "/reset-password");

  if (!resetUrlBase) {
    response.status(400).json({ error: "Nao foi possivel montar o link de recuperacao desta instalacao." });
    return;
  }

  const activeAccount = account && isActiveUser(account) ? account : null;
  const { token } = activeAccount ? createPasswordResetToken(activeAccount) : { token: "" };
  const resetUrl = token ? `${resetUrlBase}?token=${encodeURIComponent(token)}` : "";

  try {
    await sendPasswordRecoveryEmail(
      {
        submittedEmail: normalizedEmail,
        recipientEmail: activeAccount?.email || "",
        recipientName: activeAccount?.name || "usuario",
        resetUrl,
      },
      state,
    );
    await insertSystemLog(
      createSystemLog({
        ...buildActorFromUser(activeAccount || null),
        module: "autenticacao",
        eventType: "configuracao",
        description: `Solicitacao de recuperacao de senha registrada para ${normalizedEmail}.`,
        origin: getRequestOrigin(request),
        status: "sucesso",
        metadata: { action: "password_recovery_request", submittedEmail: normalizedEmail, matchedUserId: activeAccount?.id || "" },
      }),
    );
    response.json({ ok: true, message: "Se o e-mail existir e estiver ativo, enviaremos o link de recuperacao." });
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Falha ao enviar a recuperacao de senha.",
    });
  }
}));

app.post("/api/auth/reset-password", handleAsync(async (request, response) => {
  const resetToken = String(request.body?.token || "").trim();
  const nextPassword = String(request.body?.newPassword || "");
  const parsedToken = verifyPasswordResetToken(resetToken);

  if (!parsedToken?.userId) {
    response.status(400).json({ error: "O link de recuperacao expirou ou e invalido." });
    return;
  }

  const account = await readUserById(parsedToken.userId);
  if (!account || !isActiveUser(account)) {
    response.status(400).json({ error: "A conta vinculada a este link nao esta mais disponivel." });
    return;
  }

  if (parsedToken.passwordFingerprint !== getPasswordFingerprint(account.password || "")) {
    response.status(400).json({ error: "Este link de recuperacao ja nao e mais valido." });
    return;
  }

  const passwordValidationError = validateNextPassword(nextPassword);
  if (passwordValidationError) {
    response.status(400).json({ error: passwordValidationError });
    return;
  }

  if (verifyPassword(nextPassword, account.password || "")) {
    response.status(400).json({ error: "Escolha uma senha diferente da anterior." });
    return;
  }

  const nextPasswordHash = hashPassword(nextPassword);
  await updateUserPassword(account.id, nextPasswordHash, { mustChangePassword: false, passwordReveal: nextPassword });
  const persistedUser = await readUserById(account.id);
  if (!persistedUser) {
    response.status(500).json({ error: "Nao foi possivel concluir a redefinicao da senha." });
    return;
  }

  const { token, expiresAt } = createSessionToken(persistedUser);
  response.setHeader("Set-Cookie", createSessionCookie(token, expiresAt));

  await insertSystemLog(
    createSystemLog({
      ...buildActorFromUser(persistedUser),
      module: "autenticacao",
      eventType: "configuracao",
      description: `Senha redefinida por recuperacao para ${persistedUser.name}.`,
      origin: getRequestOrigin(request),
      status: "alerta",
      metadata: { action: "password_recovery_reset" },
    }),
  );

  response.json({ user: sanitizeSessionUser(persistedUser), expiresAt });
}));

app.use(
  "/api/v1",
  createV1Router({
    requireAuthenticatedUser,
    stateService,
    ticketService,
    collectionService,
    persistStateChange: (context) => persistStateChange(context.request, context.response, context.auth, context.nextState),
  }),
);

app.get("/api/state", handleAsync(async (request, response) => {
  const auth = await requireAuthenticatedUser(request, response);
  if (!auth) return;
  response.json(prepareStateForClient(auth.state, auth.requestUser));
}));

app.put("/api/state", handleAsync(async (request, response) => {
  const previousState = await readState();
  const auth = await requireAuthenticatedUser(request, response, previousState);
  if (!auth) return;

  const mergedState = mergeIncomingState(previousState, request.body || {});
  const persistedState = await persistStateChange(request, response, auth, mergedState);
  if (!persistedState) return;
  response.json(prepareStateForClient(persistedState, auth.requestUser));
}));

app.post("/api/notifications/test", handleAsync(async (request, response) => {
  const auth = await requireAuthenticatedUser(request, response);
  if (!auth) return;
  if (!hasAnyPermission(auth.requestUser, ["notifications_manage", "users_manage_permissions", "users_admin", "service_center_manage"])) {
    response.status(403).json({ error: "Voce nao possui permissao para testar notificacoes." });
    return;
  }

  try {
    await sendNotificationTest(request.body || {}, auth.state);
    await insertSystemLog(
      createSystemLog({
        ...buildActorFromUser(auth.requestUser),
        module: "administracao",
        eventType: "configuracao",
        description: `Teste de notificacao executado por ${auth.requestUser.name}.`,
        origin: getRequestOrigin(request),
        status: "sucesso",
        metadata: { action: "notification_test" },
      }),
    );
    response.json({ ok: true });
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Falha ao testar envio de email.",
    });
  }
}));

app.get("/api/public/intake/:accessToken", handleAsync(async (request, response) => {
  const state = await readState();
  const accessToken = String(request.params.accessToken || "").trim();
  if (!isValidPublicIntakeToken(state, accessToken)) {
    response.status(404).json({ error: "Canal externo nao encontrado." });
    return;
  }

  const bootstrap = buildPublicIntakeBootstrap(state);
  response.json(
    buildEnvelope(
      {
        apiVersion: "v1",
        payloadVersion: state.payloadVersion,
        schemaVersion: state.schemaVersion,
        domain: "public_intake",
        publicLink: buildPublicHashUrl(request, `public/request/${accessToken}`),
      },
      bootstrap,
    ),
  );
}));

app.post("/api/public/intake/:accessToken/tickets", handleAsync(async (request, response) => {
  const state = await readState();
  const accessToken = String(request.params.accessToken || "").trim();
  if (!isValidPublicIntakeToken(state, accessToken)) {
    response.status(404).json({ error: "Canal externo nao encontrado." });
    return;
  }

  const publicIntake = getPublicIntakeConfig(state);
  if (!publicIntake.enabled) {
    response.status(403).json({ error: "Abertura externa desativada." });
    return;
  }

  const { ticket, nextState } = createPublicTicket(state, request.body || {});
  const persistedState = await writeState(nextState);

  await insertSystemLog(
    createSystemLog({
      userName: ticket.requester || "Portal externo",
      userDepartment: ticket.department || "",
      module: "tickets",
      eventType: "abertura_externa",
      description: `Chamado externo ${ticket.id} aberto sem autenticacao.`,
      origin: getRequestOrigin(request),
      status: "sucesso",
      metadata: {
        ticketId: ticket.id,
        requesterEmail: ticket.requesterEmail || "",
        departmentId: ticket.departmentId || "",
      },
    }),
  );

  void processTicketNotifications({
    previousState: state,
    nextState: persistedState,
    persistState: writeState,
    baseUrl: process.env.APP_PUBLIC_URL || buildPublicAppUrl(request, ""),
  }).catch((error) => {
    console.error("public notification processing failed", error);
  });

  const persistedTicket =
    (persistedState.tickets || []).find((candidate) => String(candidate.id || "").trim() === String(ticket.id || "").trim()) || ticket;

  response.status(201).json(
    buildEnvelope(
      {
        apiVersion: "v1",
        payloadVersion: persistedState.payloadVersion,
        schemaVersion: persistedState.schemaVersion,
        domain: "tickets",
        created: true,
      },
      persistedTicket,
    ),
  );
}));

app.use(express.static(distPath));

app.use((error, request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  console.error("request failed", error);
  const statusCode = isDatabaseConnectionError(error) ? 503 : 500;
  const message = isDatabaseConnectionError(error)
    ? "Banco de dados temporariamente indisponivel."
    : "Falha interna do servidor.";

  if (request.path.startsWith("/api/")) {
    response.status(statusCode).json({ error: message });
    return;
  }

  response.status(statusCode).send(message);
});

app.get("*", (request, response) => {
  if (request.path.startsWith("/api/")) {
    response.status(404).json({ error: "Rota nao encontrada." });
    return;
  }

  response.sendFile(path.join(distPath, "index.html"));
});

app.listen(port, () => {
  console.log(`TicketMind server listening on port ${port}`);
});

function appendEscalationWatchers(watcherDetails = [], users = []) {
  const registry = new Map((Array.isArray(watcherDetails) ? watcherDetails : []).map((watcher) => [String(watcher.userId || watcher.email || watcher.name || "").trim(), watcher]));
  for (const candidate of users) {
    const userId = String(candidate?.id || "").trim();
    if (!userId || registry.has(userId)) continue;
    registry.set(userId, {
      id: `watcher-escalation-${userId}`,
      userId,
      name: candidate.name || candidate.email || "Responsavel",
      email: String(candidate.email || "").trim().toLowerCase(),
      eventKeys: ["ticket_status_changed", "ticket_assignment_changed", "ticket_sla_breached", "ticket_commented"],
    });
  }
  return Array.from(registry.values());
}

function resolveEscalationTargets(state = {}, ticket = {}) {
  const departmentId = String(ticket.departmentId || "").trim();
  const departmentConfig = state.serviceCenter?.departments?.[departmentId] || {};
  const responsibleIds = Array.isArray(departmentConfig.responsibleUserIds) ? departmentConfig.responsibleUserIds : [];
  return (state.users || []).filter((candidate) => responsibleIds.includes(candidate.id) && normalizeText(candidate.status || "Ativo") === "ativo");
}

function buildEscalationChange(ticket, state = {}, nowIso = new Date().toISOString()) {
  const rules = state.serviceCenter?.escalationRules || {};
  if (rules.enabled === false || !isOpenTicketStatus(ticket.status)) return null;

  const escalation = ticket.escalation && typeof ticket.escalation === "object" ? ticket.escalation : {};
  const maxLevel = Math.max(1, Number(rules.maxEscalationLevel) || 3);
  const currentLevel = Number(escalation.level) || 0;
  if (currentLevel >= maxLevel) return null;

  const openedAtTime = new Date(ticket.openedAt || ticket.updatedAtIso || nowIso).getTime();
  const nowTime = new Date(nowIso).getTime();
  const unassignedMinutes = Math.max(5, Number(rules.unassignedMinutes) || 60);
  const hasAssignee = Boolean(String(ticket.assignee || "").trim());
  const unassignedKey = `unassigned:${ticket.id}`;
  if (rules.unassignedEnabled !== false && !hasAssignee && nowTime - openedAtTime >= unassignedMinutes * 60 * 1000 && escalation.lastTriggerKey !== unassignedKey) {
    return { reason: "unassigned", key: unassignedKey };
  }

  const overdueKey = `overdue:${ticket.slaBreachedAt || ticket.slaDeadlineAt || ticket.id}`;
  const isOverdue = ticket.slaDeadlineAt && nowTime > new Date(ticket.slaDeadlineAt).getTime();
  if (rules.overdueEnabled !== false && isOverdue && escalation.lastTriggerKey !== overdueKey) {
    return { reason: "overdue", key: overdueKey };
  }

  return null;
}

async function runEscalationCycle() {
  try {
    const state = await readState();
    const nowIso = new Date().toISOString();
    let changed = false;
    const nextTickets = (state.tickets || []).map((ticket) => {
      const change = buildEscalationChange(ticket, state, nowIso);
      if (!change) return ticket;

      const targets = resolveEscalationTargets(state, ticket);
      const escalation = ticket.escalation && typeof ticket.escalation === "object" ? ticket.escalation : {};
      const nextLevel = Math.min((Number(escalation.level) || 0) + 1, Math.max(1, Number(state.serviceCenter?.escalationRules?.maxEscalationLevel) || 3));
      const nextAssignee =
        change.reason === "unassigned" && !String(ticket.assignee || "").trim()
          ? String(targets[0]?.name || ticket.assignee || "").trim()
          : String(ticket.assignee || "").trim();
      const message =
        change.reason === "unassigned"
          ? `Chamado escalonado automaticamente por falta de responsavel`
          : `Chamado escalonado automaticamente por vencimento de SLA`;

      changed = true;
      return {
        ...ticket,
        assignee: nextAssignee,
        watcherDetails: appendEscalationWatchers(ticket.watcherDetails, targets),
        escalation: {
          ...escalation,
          level: nextLevel,
          lastReason: change.reason,
          lastEscalatedAt: nowIso,
          lastTriggerKey: change.key,
          targetUserIds: targets.map((candidate) => candidate.id),
        },
        triage: {
          ...(ticket.triage && typeof ticket.triage === "object" ? ticket.triage : {}),
          escalationLevel: nextLevel,
          escalatedAt: nowIso,
          escalationReason: change.reason,
        },
        updatedAtIso: nowIso,
        updatedAt: nowIso,
        history: [
          createHistoryEntry({
            type: "escalation",
            actorName: "Sistema",
            message,
            metadata: {
              reason: change.reason,
              escalationLevel: nextLevel,
              assignedTo: nextAssignee,
              notifiedUsers: targets.map((candidate) => candidate.name),
            },
            createdAt: nowIso,
          }),
          ...(Array.isArray(ticket.history) ? ticket.history : []),
        ],
      };
    });

    if (changed) {
      await writeState({
        ...state,
        tickets: nextTickets,
      });
    }
  } catch (error) {
    console.error("ticket escalation cycle failed", error);
  }
}

async function runApprovalReminderCycle() {
  try {
    const state = await readState();
    await processRecurringApprovalReminders({
      state,
      persistState: writeState,
      baseUrl: process.env.APP_PUBLIC_URL || "",
    });
  } catch (error) {
    console.error("approval reminder cycle failed", error);
  }
}

if (!approvalReminderTimer) {
  approvalReminderTimer = setInterval(runApprovalReminderCycle, approvalReminderPollMs);
  if (typeof approvalReminderTimer.unref === "function") {
    approvalReminderTimer.unref();
  }
  void runApprovalReminderCycle();
}

if (!escalationTimer) {
  escalationTimer = setInterval(runEscalationCycle, approvalReminderPollMs);
  if (typeof escalationTimer.unref === "function") {
    escalationTimer.unref();
  }
  void runEscalationCycle();
}
