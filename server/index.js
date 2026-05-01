import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { insertSystemLog, querySystemLogs, readState, sanitizeSessionUser, writeState } from "./db.js";
import {
  mergeIncomingState,
  prepareStateForClient,
  processTicketNotifications,
  sendNotificationTest,
} from "./notifications.js";
import { buildActorFromUser, collectStateAuditLogs, createSystemLog, getRequestOrigin, isTiDepartmentUser } from "./systemLogs.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT || 3001);
const distPath = path.resolve(__dirname, "..", "dist");

app.use(express.json({ limit: "15mb" }));

function hasPermission(user, permissionKey) {
  return Boolean(user?.permissions && user.permissions[permissionKey]);
}

function toIsoDateOrEmpty(value, { endOfDay = false } = {}) {
  const trimmedValue = String(value || "").trim();
  if (!trimmedValue) return "";
  const parsed = new Date(endOfDay ? `${trimmedValue}T23:59:59.999` : trimmedValue);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

async function resolveRequestUser(request, stateOverride = null) {
  const state = stateOverride || (await readState());
  const userId = String(request.headers["x-user-id"] || "").trim();
  if (!userId) return null;
  return state.users.find((candidate) => candidate.id === userId) || null;
}

async function requireTiAccess(request, response) {
  const state = await readState();
  const requestUser = await resolveRequestUser(request, state);
  if (requestUser && isTiDepartmentUser(requestUser) && hasPermission(requestUser, "system_logs_view")) {
    return { state, requestUser };
  }

  const actor = buildActorFromUser(requestUser, { userName: "Acesso nao autorizado" });
  await insertSystemLog(
    createSystemLog({
      ...actor,
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
  response.json({ ok: true });
});

app.post("/api/auth/login", async (request, response) => {
  const { email, password } = request.body || {};
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedPassword = String(password || "");
  const state = await readState();

  if (!normalizedEmail || !normalizedPassword) {
    response.status(400).json({ error: "Preencha email e senha para continuar." });
    return;
  }

  const user = state.users.find(
    (candidate) =>
      String(candidate.email || "").trim().toLowerCase() === normalizedEmail &&
      String(candidate.password || "") === normalizedPassword,
  );

  if (!user) {
    await insertSystemLog(
      createSystemLog({
        userName: normalizedEmail || "Login sem email",
        userDepartment: "",
        module: "autenticacao",
        eventType: "login",
        description: `Falha de login para ${normalizedEmail || "email nao informado"}.`,
        origin: getRequestOrigin(request),
        status: "erro",
        metadata: { email: normalizedEmail },
      }),
    );
    response.status(401).json({ error: "Credenciais invalidas." });
    return;
  }

  await insertSystemLog(
    createSystemLog({
      ...buildActorFromUser(user),
      module: "autenticacao",
      eventType: "login",
      description: `Login realizado por ${user.name}.`,
      origin: getRequestOrigin(request),
      status: "sucesso",
      metadata: { email: user.email },
    }),
  );

  response.json(sanitizeSessionUser(user));
});

app.get("/api/auth/session/:userId", async (request, response) => {
  const state = await readState();
  const user = state.users.find((candidate) => candidate.id === request.params.userId);

  if (!user) {
    response.status(404).json({ error: "Sessao nao encontrada." });
    return;
  }

  response.json(sanitizeSessionUser(user));
});

app.get("/api/state", async (_request, response) => {
  response.json(prepareStateForClient(await readState()));
});

app.put("/api/state", async (request, response) => {
  const previousState = await readState();
  const requestUser = await resolveRequestUser(request, previousState);
  const mergedState = mergeIncomingState(previousState, request.body || {});
  const persistedState = await writeState(mergedState);
  response.json(prepareStateForClient(persistedState));

  const auditLogs = collectStateAuditLogs(
    previousState,
    persistedState,
    buildActorFromUser(requestUser),
    getRequestOrigin(request),
  );
  await Promise.all(auditLogs.map((entry) => insertSystemLog(entry)));

  void processTicketNotifications({
    previousState,
    nextState: persistedState,
    persistState: writeState,
    baseUrl: process.env.APP_PUBLIC_URL || "",
  }).catch((error) => {
    console.error("notification processing failed", error);
  });
});

app.post("/api/notifications/test", async (request, response) => {
  try {
    const persistedState = await readState();
    await sendNotificationTest(request.body || {}, persistedState);
    response.json({ ok: true });
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Falha ao testar envio de email.",
    });
  }
});

app.get("/api/system-logs", async (request, response) => {
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
});

app.use(express.static(distPath));

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
