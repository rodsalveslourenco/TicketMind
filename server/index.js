import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasAnyPermission } from "../src/data/permissions.js";
import { insertSystemLog, querySystemLogs, readState, readUserByEmail, readUserById, sanitizeSessionUser, updateUserPassword, writeState } from "./db.js";
import {
  mergeIncomingState,
  prepareStateForClient,
  processTicketNotifications,
  sendNotificationTest,
} from "./notifications.js";
import {
  clearSessionCookie,
  createSessionCookie,
  createSessionToken,
  getPasswordFingerprint,
  getSessionTokenFromRequest,
  hashPassword,
  needsPasswordUpgrade,
  verifyPassword,
  verifySessionToken,
} from "./security.js";
import { buildActorFromUser, collectStateAuditLogs, createSystemLog, getRequestOrigin, isTiDepartmentUser } from "./systemLogs.js";
import { createV1Router } from "./api/routes/v1.js";
import * as stateRepository from "./repositories/stateRepository.js";
import { createStateService } from "./services/stateService.js";
import { createTicketService } from "./services/ticketService.js";
import { createCollectionService } from "./services/collectionService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT || 3001);
const distPath = path.resolve(__dirname, "..", "dist");
const stateService = createStateService({ stateRepository });
const ticketService = createTicketService({ stateService });
const collectionService = createCollectionService({ stateService });

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

function hasPermission(user, permissionKey) {
  return Boolean(user?.permissions && user.permissions[permissionKey]);
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
    case "email_layouts_manage":
    case "email_service_manage":
    case "notification_rules_manage":
      return hasAnyPermission(user, ["users_manage_permissions", "users_admin"]);
    case "user_delete":
      return hasAnyPermission(user, ["users_delete", "users_admin"]);
    case "departments_manage":
      return hasAnyPermission(user, ["service_center_departments_manage", "service_center_manage", "users_admin"]);
    case "locations_manage":
      return hasAnyPermission(user, ["service_center_departments_manage", "service_center_manage", "users_admin"]);
    case "service_center_manage":
    case "smtp_manage":
      return hasAnyPermission(user, ["service_center_manage", "users_manage_permissions", "users_admin"]);
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

    if (previousUser) {
      if (!nextPassword.trim()) {
        return { ...nextUser, password: previousUser.password || "" };
      }
      if (nextPassword === String(previousUser.password || "")) {
        return nextUser;
      }
      return { ...nextUser, password: hashPassword(nextPassword) };
    }

    return {
      ...nextUser,
      password: nextPassword.trim() ? hashPassword(nextPassword) : "",
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

async function requireTiAccess(request, response, stateOverride = null) {
  const auth = await requireAuthenticatedUser(request, response, stateOverride);
  if (!auth) return null;
  if (isTiDepartmentUser(auth.requestUser) && hasPermission(auth.requestUser, "system_logs_view")) {
    return auth;
  }

  await insertSystemLog(
    createSystemLog({
      ...buildActorFromUser(auth.requestUser, { userName: "Acesso nao autorizado" }),
      module: "seguranca",
      eventType: "permissao",
      description: "Tentativa de acesso nao autorizado ao Log Geral do Sistema.",
      origin: getRequestOrigin(request),
      status: "erro",
      metadata: {
        route: request.originalUrl,
        method: request.method,
      },
    }),
  );

  response.status(403).json({ error: "Acesso restrito ao departamento de TI." });
  return null;
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
    await updateUserPassword(user.id, upgradedPassword);
    authenticatedUser = { ...user, password: upgradedPassword };
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
  response.json(prepareStateForClient(auth.state));
}));

app.put("/api/state", handleAsync(async (request, response) => {
  const previousState = await readState();
  const auth = await requireAuthenticatedUser(request, response, previousState);
  if (!auth) return;

  const mergedState = mergeIncomingState(previousState, request.body || {});
  const persistedState = await persistStateChange(request, response, auth, mergedState);
  if (!persistedState) return;
  response.json(prepareStateForClient(persistedState));
}));

app.post("/api/notifications/test", handleAsync(async (request, response) => {
  const auth = await requireAuthenticatedUser(request, response);
  if (!auth) return;
  if (!hasAnyPermission(auth.requestUser, ["users_manage_permissions", "users_admin", "service_center_manage"])) {
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

app.get("/api/system-logs", handleAsync(async (request, response) => {
  const access = await requireTiAccess(request, response);
  if (!access) return;

  const startDate = String(request.query.startDate || "").trim();
  const endDate = String(request.query.endDate || "").trim();
  const queryResult = await querySystemLogs({
    startDate: toIsoDateOrEmpty(startDate),
    endDate: toIsoDateOrEmpty(endDate, { endOfDay: true }),
    user: String(request.query.user || "").trim(),
    department: String(request.query.department || "").trim(),
    module: String(request.query.module || "").trim(),
    eventType: String(request.query.eventType || "").trim(),
    status: String(request.query.status || "").trim(),
    search: String(request.query.search || "").trim(),
    page: Number(request.query.page) || 1,
    limit: Number(request.query.limit) || 25,
  });

  response.json(queryResult);
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
