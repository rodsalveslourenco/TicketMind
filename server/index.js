import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHistoryEntry, getTicketStatusOptionsForType, isOpenTicketStatus, normalizeText, normalizeTicketStatus } from "../src/data/helpdesk.js";
import { hasAnyPermission } from "../src/data/permissions.js";
import { canAccessTicket } from "../src/data/ticketVisibility.js";
import { DOMAIN_COLLECTION_KEYS, DOMAIN_SINGLETON_KEYS, insertSystemLog, querySystemLogs, readState, readUserByEmail, readUserById, removeDomainRecord, runPersistenceDiagnostic, sanitizeSessionUser, saveDomainRecord, saveSingletonRecord, saveTicketRecord, updateUserPassword, writeState } from "./db.js";
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
import {
  buildPublicIntakeBootstrap,
  createPublicTicket,
  getPublicIntakeConfig,
  isValidPublicIntakeToken,
  lookupPublicRequester,
} from "./publicIntake.js";

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
const realtimeClients = new Set();

app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: "15mb" }));

// Rate limiting nas rotas sensiveis (anti brute force / abuso / DoS).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
});
const intakeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.INTAKE_RATE_LIMIT) || 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas solicitacoes. Tente novamente mais tarde." },
});
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/forgot-password", authLimiter);
app.use("/api/auth/reset-password", authLimiter);
app.use("/api/public/intake", intakeLimiter);

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

function getRealtimeSourceClientId(request) {
  return String(request.headers["x-ticketmind-client"] || request.query?.clientId || "").trim();
}

function sendRealtimeEvent(client, eventName, payload) {
  try {
    client.response.write(`event: ${eventName}\n`);
    client.response.write(`data: ${JSON.stringify(payload)}\n\n`);
  } catch {
    realtimeClients.delete(client);
  }
}

function broadcastStateUpdate(nextState, sourceClientId = "") {
  if (!realtimeClients.size) return;
  for (const client of realtimeClients) {
    const clientState = prepareStateForClient(nextState, client.user);
    sendRealtimeEvent(client, "state", {
      sourceClientId,
      payloadVersion: nextState.payloadVersion,
      schemaVersion: nextState.schemaVersion,
      updatedAt: new Date().toISOString(),
      state: clientState,
    });
  }
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

function protectIncomingTickets(previousState = {}, nextState = {}, requestUser = null) {
  const previousTickets = Array.isArray(previousState.tickets) ? previousState.tickets : [];
  const nextTickets = Array.isArray(nextState.tickets) ? nextState.tickets : null;
  if (!nextTickets) return previousTickets;

  const canDeleteTickets = hasAnyPermission(requestUser, ["tickets_delete", "tickets_admin"]);
  if (canDeleteTickets || nextTickets.length >= previousTickets.length) {
    return nextTickets;
  }

  const nextTicketIds = new Set(nextTickets.map((ticket) => String(ticket?.id || "").trim()).filter(Boolean));
  const preservedTickets = previousTickets.filter((ticket) => !nextTicketIds.has(String(ticket?.id || "").trim()));
  return [...nextTickets, ...preservedTickets];
}

function applyServerStateProtections(previousState = {}, nextState = {}, requestUser = null) {
  return {
    ...nextState,
    users: protectIncomingUsers(previousState, nextState),
    tickets: protectIncomingTickets(previousState, nextState, requestUser),
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
  const protectedState = applyServerStateProtections(previousState, nextState, auth.requestUser);
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

  broadcastStateUpdate(persistedState, getRealtimeSourceClientId(request));

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

const SERVER_STARTED_AT = new Date().toISOString();
const SERVER_COMMIT = String(
  process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || process.env.SOURCE_VERSION || "",
).trim();

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, apiVersion: "v1", commit: SERVER_COMMIT || "desconhecido", startedAt: SERVER_STARTED_AT });
});

// Diagnostico: permite confirmar exatamente qual versao/commit esta no ar.
app.get("/api/version", (_request, response) => {
  response.json({
    commit: SERVER_COMMIT || "desconhecido",
    startedAt: SERVER_STARTED_AT,
    node: process.version,
    storage: process.env.DATABASE_URL ? "postgres" : "sqlite",
  });
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
    // Nao vaza detalhes do provedor nem a existencia da conta: registra
    // internamente e responde de forma generica (anti-enumeracao).
    console.error("Falha ao enviar recuperacao de senha:", error);
    response.json({ ok: true, message: "Se o e-mail existir e estiver ativo, enviaremos o link de recuperacao." });
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

app.get("/api/diag/resolve", handleAsync(async (request, response) => {
  const auth = await requireAuthenticatedUser(request, response);
  if (!auth) return;
  if (!hasAnyPermission(auth.requestUser, ["users_admin"])) {
    response.status(403).json({ error: "Apenas administradores podem executar o diagnostico." });
    return;
  }
  const state = await readState();
  const serviceCenter = state.serviceCenter || {};
  const tickets = Array.isArray(state.tickets) ? state.tickets : [];
  const sample = tickets.slice(0, 8).map((ticket) => {
    const options = getTicketStatusOptionsForType(ticket.type || "Incidente", serviceCenter);
    const resolvedAllowed = options.some((status) => normalizeText(status) === "resolvido");
    return { id: ticket.id, type: ticket.type || "", status: ticket.status || "", resolvedAllowed, options };
  });
  response.json({
    ticketStatusProfiles: serviceCenter.ticketStatusProfiles || null,
    totalTickets: tickets.length,
    sample,
  });
}));

app.get("/api/diag/persistence", handleAsync(async (request, response) => {
  const auth = await requireAuthenticatedUser(request, response);
  if (!auth) return;
  if (!hasAnyPermission(auth.requestUser, ["users_admin"])) {
    response.status(403).json({ error: "Apenas administradores podem executar o diagnostico." });
    return;
  }
  try {
    const report = await runPersistenceDiagnostic();
    response.json(report);
  } catch (error) {
    response.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}));

app.get("/api/system-logs", handleAsync(async (request, response) => {
  const auth = await requireAuthenticatedUser(request, response);
  if (!auth) return;
  if (!hasAnyPermission(auth.requestUser, ["system_logs_view", "users_admin"])) {
    response.status(403).json({ error: "Voce nao possui permissao para visualizar os logs do sistema." });
    return;
  }
  const q = request.query || {};
  const result = await querySystemLogs({
    search: String(q.search || "").trim(),
    module: String(q.module || "").trim(),
    eventType: String(q.eventType || "").trim(),
    status: String(q.status || "").trim(),
    user: String(q.user || "").trim(),
    department: String(q.department || "").trim(),
    startDate: String(q.startDate || "").trim(),
    endDate: String(q.endDate || "").trim(),
    page: Number(q.page) || 1,
    limit: Number(q.limit) || 25,
  });
  response.json(result);
}));

const SINGLETON_WRITE_PERMISSIONS = {
  serviceCenter: ["service_center_manage", "service_center_departments_manage", "users_admin"],
  queues: ["service_center_manage", "users_admin"],
  smtpSettings: ["notifications_manage", "service_center_manage", "users_admin"],
  emailServiceSettings: ["notifications_manage", "service_center_manage", "users_admin"],
  notificationEvents: ["notifications_manage", "users_admin"],
  emailPlaceholders: ["notifications_manage", "users_admin"],
  permissionProfiles: ["users_manage_permissions", "users_admin"],
  permissionCatalog: ["users_manage_permissions", "users_admin"],
  navigationSections: ["users_manage_permissions", "users_admin"],
};

// Gravacao de configuracoes (singletons), ex.: Central de Servicos.
app.put("/api/singletons/:key", handleAsync(async (request, response) => {
  const auth = await requireAuthenticatedUser(request, response);
  if (!auth) return;
  const key = String(request.params.key || "").trim();
  if (!DOMAIN_SINGLETON_KEYS.includes(key)) { response.status(404).json({ error: "Configuracao nao encontrada." }); return; }
  const perms = SINGLETON_WRITE_PERMISSIONS[key];
  if (!perms || !hasAnyPermission(auth.requestUser, perms)) { response.status(403).json({ error: "Voce nao possui permissao para alterar esta configuracao." }); return; }
  const body = request.body;
  const value = (body && typeof body === "object" && !Array.isArray(body))
    ? { ...body, updatedAt: new Date().toISOString() }
    : body;
  const saved = await saveSingletonRecord(key, value);
  await insertSystemLog(createSystemLog({ ...buildActorFromUser(auth.requestUser), module: "administracao", eventType: "configuracao", description: `Configuracao ${key} atualizada por ${auth.requestUser.name}.`, origin: getRequestOrigin(request), status: "alerta", metadata: { action: "singleton_update", key } }));
  broadcastStateUpdate(await readState(), getRealtimeSourceClientId(request));
  response.json(saved);
}));

const COLLECTION_WRITE_PERMISSIONS = {
  tickets: ["tickets_create", "tickets_edit", "tickets_admin"],
  assets: ["assets_create", "assets_edit", "assets_admin"],
  brands: ["brands_models_create", "brands_models_edit", "brands_models_admin"],
  models: ["brands_models_create", "brands_models_edit", "brands_models_admin"],
  projects: ["projects_create", "projects_edit", "projects_manage_tasks", "projects_admin"],
  knowledgeArticles: ["knowledge_create", "knowledge_edit", "knowledge_admin"],
  notificationRules: ["notifications_manage", "service_center_manage", "users_admin"],
  emailLayouts: ["email_layouts_create", "email_layouts_edit", "email_layouts_manage", "users_admin"],
  apiConfigs: ["api_rest_configure_integrations", "api_rest_admin", "users_admin"],
};

function collectionGuard(domain, requestUser) {
  if (!DOMAIN_COLLECTION_KEYS.includes(domain)) return { ok: false, code: 404, error: "Colecao nao encontrada." };
  const perms = COLLECTION_WRITE_PERMISSIONS[domain];
  if (!perms) return { ok: false, code: 403, error: "Esta colecao nao permite alteracao por aqui." };
  if (!hasAnyPermission(requestUser, perms)) return { ok: false, code: 403, error: "Voce nao possui permissao para alterar esta colecao." };
  return { ok: true };
}

function genId(domain, type) {
  if (domain === "tickets") {
    const map = { incidente: "INC", requisicao: "REQ", problema: "PRB" };
    const prefix = map[normalizeText(type)] || "TCK";
    return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
  }
  return `${domain}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// CRUD INCREMENTAL generico de colecoes (ativos, projetos, base de conhecimento,
// marcas, modelos, notificacoes...). Uma linha por operacao, confiavel.
app.post("/api/collections/:domain", handleAsync(async (request, response) => {
  const auth = await requireAuthenticatedUser(request, response);
  if (!auth) return;
  const domain = String(request.params.domain || "").trim();
  const guard = collectionGuard(domain, auth.requestUser);
  if (!guard.ok) { response.status(guard.code).json({ error: guard.error }); return; }
  const body = request.body && typeof request.body === "object" ? request.body : {};
  const nowIso = new Date().toISOString();
  const item = { ...body, id: String(body.id || "").trim() || genId(domain, body.type), createdAt: body.createdAt || nowIso, updatedAt: nowIso };
  const saved = await saveDomainRecord(domain, item);
  broadcastStateUpdate(await readState(), getRealtimeSourceClientId(request));
  response.status(201).json(saved);
}));

app.put("/api/collections/:domain/:id", handleAsync(async (request, response) => {
  const auth = await requireAuthenticatedUser(request, response);
  if (!auth) return;
  const domain = String(request.params.domain || "").trim();
  const guard = collectionGuard(domain, auth.requestUser);
  if (!guard.ok) { response.status(guard.code).json({ error: guard.error }); return; }
  const id = String(request.params.id || "").trim();
  const state = await readState();
  const existing = (Array.isArray(state[domain]) ? state[domain] : []).find((it) => String(it?.id || "").trim() === id) || {};
  const body = request.body && typeof request.body === "object" ? request.body : {};
  const item = { ...existing, ...body, id, updatedAt: new Date().toISOString() };
  const saved = await saveDomainRecord(domain, item);
  broadcastStateUpdate(await readState(), getRealtimeSourceClientId(request));
  response.json(saved);
}));

app.delete("/api/collections/:domain/:id", handleAsync(async (request, response) => {
  const auth = await requireAuthenticatedUser(request, response);
  if (!auth) return;
  const domain = String(request.params.domain || "").trim();
  const guard = collectionGuard(domain, auth.requestUser);
  if (!guard.ok) { response.status(guard.code).json({ error: guard.error }); return; }
  await removeDomainRecord(domain, String(request.params.id || "").trim());
  broadcastStateUpdate(await readState(), getRealtimeSourceClientId(request));
  response.status(204).end();
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

app.get("/api/state/stream", handleAsync(async (request, response) => {
  const auth = await requireAuthenticatedUser(request, response);
  if (!auth) return;

  response.setHeader("Content-Type", "text/event-stream");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");
  response.setHeader("X-Accel-Buffering", "no");
  response.flushHeaders?.();

  const client = {
    id: getRealtimeSourceClientId(request) || `stream-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    response,
    user: auth.requestUser,
  };
  realtimeClients.add(client);
  sendRealtimeEvent(client, "ping", { ok: true, connectedAt: new Date().toISOString() });

  const heartbeat = setInterval(() => {
    sendRealtimeEvent(client, "ping", { ok: true, at: new Date().toISOString() });
  }, 25000);

  request.on("close", () => {
    clearInterval(heartbeat);
    realtimeClients.delete(client);
  });
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

// Gravacao INCREMENTAL de um unico chamado (resolver, mudar status, editar).
// Substitui o salvamento de estado inteiro para chamados: confiavel e leve.
app.put("/api/tickets/:ticketId", handleAsync(async (request, response) => {
  const previousState = await readState();
  const auth = await requireAuthenticatedUser(request, response, previousState);
  if (!auth) return;
  const ticketId = String(request.params.ticketId || "").trim();
  const existing = (previousState.tickets || []).find((item) => String(item?.id || "").trim() === ticketId) || null;
  if (!existing) {
    response.status(404).json({ error: "Chamado nao encontrado." });
    return;
  }
  if (!canAccessTicket(existing, auth.requestUser, previousState.departments || [], previousState.serviceCenter || {})) {
    response.status(403).json({ error: "Voce nao tem acesso a este chamado." });
    return;
  }
  if (
    !hasAnyPermission(auth.requestUser, [
      "tickets_edit",
      "tickets_close",
      "tickets_change_status",
      "tickets_assign",
      "tickets_change_priority",
      "tickets_reopen",
      "tickets_admin",
    ])
  ) {
    response.status(403).json({ error: "Voce nao possui permissao para alterar chamados." });
    return;
  }
  const incoming = request.body && typeof request.body === "object" ? request.body : {};
  const nowIso = new Date().toISOString();
  const nextTicket = {
    ...existing,
    ...incoming,
    id: ticketId,
    status: normalizeTicketStatus(incoming.status ?? existing.status),
    openedAt: existing.openedAt || incoming.openedAt || nowIso,
    updatedAt: nowIso,
    updatedAtIso: nowIso,
  };
  const saved = await saveTicketRecord(nextTicket);
  await insertSystemLog(
    createSystemLog({
      ...buildActorFromUser(auth.requestUser),
      module: "chamados",
      eventType: "configuracao",
      description: `Chamado ${ticketId} atualizado por ${auth.requestUser.name}.`,
      origin: getRequestOrigin(request),
      status: "sucesso",
      metadata: { action: "ticket_update", ticketId, status: nextTicket.status },
    }),
  );
  const refreshedState = await readState();
  void processTicketNotifications({
    previousState,
    nextState: refreshedState,
    persistState: writeState,
    baseUrl: process.env.APP_PUBLIC_URL || "",
  }).catch((error) => console.error("notification processing failed", error));
  broadcastStateUpdate(refreshedState, getRealtimeSourceClientId(request));
  response.json(saved);
}));

app.delete("/api/tickets/:ticketId", handleAsync(async (request, response) => {
  const previousState = await readState();
  const auth = await requireAuthenticatedUser(request, response, previousState);
  if (!auth) return;
  const ticketId = String(request.params.ticketId || "").trim();
  const existing = (previousState.tickets || []).find((item) => String(item?.id || "").trim() === ticketId) || null;
  if (!existing) {
    response.status(404).json({ error: "Chamado nao encontrado." });
    return;
  }
  if (!canAccessTicket(existing, auth.requestUser, previousState.departments || [], previousState.serviceCenter || {})) {
    response.status(403).json({ error: "Voce nao tem acesso a este chamado." });
    return;
  }
  if (!hasAnyPermission(auth.requestUser, ["tickets_delete", "tickets_admin"])) {
    response.status(403).json({ error: "Voce nao possui permissao para excluir chamados." });
    return;
  }
  await removeDomainRecord("tickets", ticketId);
  await insertSystemLog(
    createSystemLog({
      ...buildActorFromUser(auth.requestUser),
      module: "chamados",
      eventType: "exclusao",
      description: `Chamado ${ticketId} (${existing.title || "sem titulo"}) excluido por ${auth.requestUser.name}.`,
      origin: getRequestOrigin(request),
      status: "sucesso",
      metadata: { action: "ticket_delete", ticketId },
    }),
  );
  const refreshedState = await readState();
  broadcastStateUpdate(refreshedState, getRealtimeSourceClientId(request));
  response.json({ ok: true, id: ticketId });
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

app.get("/api/public/intake/:accessToken/requester", handleAsync(async (request, response) => {
  const state = await readState();
  const accessToken = String(request.params.accessToken || "").trim();
  if (!isValidPublicIntakeToken(state, accessToken)) {
    response.status(404).json({ error: "Canal externo nao encontrado." });
    return;
  }

  const requesterSnapshot = lookupPublicRequester(state, String(request.query.email || "").trim());
  response.json(
    buildEnvelope(
      {
        apiVersion: "v1",
        payloadVersion: state.payloadVersion,
        schemaVersion: state.schemaVersion,
        domain: "public_requester_lookup",
      },
      requesterSnapshot,
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

  const { ticket, nextState, requesterUser, createdPreRegistration } = createPublicTicket(state, request.body || {});
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
        requesterUserId: requesterUser?.id || "",
        createdPreRegistration: Boolean(createdPreRegistration),
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

  broadcastStateUpdate(persistedState, getRealtimeSourceClientId(request));

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
        createdPreRegistration: Boolean(createdPreRegistration),
      },
      {
        ...persistedTicket,
        requesterDirectoryStatus: createdPreRegistration ? "pre_registered" : "known_requester",
      },
    ),
  );
}));

app.use(express.static(distPath, { index: false }));

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

// TicketMind 2 e o app oficial: servido na raiz (link do antigo v1) e tambem
// em /v2 para compatibilidade com links existentes (ex.: portal publico).
// O v1 fica ARQUIVADO no repositorio (dist/index.html) e nao e mais servido.
app.get(["/v2", "/v2/*"], (request, response) => {
  response.sendFile(path.join(distPath, "v2", "index.html"));
});

app.get("*", (request, response) => {
  if (request.path.startsWith("/api/")) {
    response.status(404).json({ error: "Rota nao encontrada." });
    return;
  }

  response.sendFile(path.join(distPath, "v2", "index.html"));
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

const ESCALATION_PAUSED_STATUSES = new Set([
  "pausado",
  "em espera",
  "aguardando usuario",
  "aguardando aprovacao",
]);

function buildEscalationChange(ticket, state = {}, nowIso = new Date().toISOString()) {
  const rules = state.serviceCenter?.escalationRules || {};
  // Nao escala chamados legitimamente parados (pausa/espera/aprovacao): o relogio
  // de atraso nao deve correr contra o time enquanto se aguarda terceiro/usuario.
  if (
    rules.enabled === false ||
    !isOpenTicketStatus(ticket.status) ||
    ESCALATION_PAUSED_STATUSES.has(normalizeText(ticket.status))
  ) {
    return null;
  }

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
