import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readState, sanitizeSessionUser, writeState } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT || 3001);
const distPath = path.resolve(__dirname, "..", "dist");

app.use(express.json({ limit: "15mb" }));

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.post("/api/auth/login", async (request, response) => {
  const { email, password } = request.body || {};
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedPassword = String(password || "");

  if (!normalizedEmail || !normalizedPassword) {
    response.status(400).json({ error: "Preencha email e senha para continuar." });
    return;
  }

  const state = await readState();
  const user = state.users.find(
    (candidate) =>
      String(candidate.email || "").trim().toLowerCase() === normalizedEmail &&
      String(candidate.password || "") === normalizedPassword,
  );

  if (!user) {
    response.status(401).json({ error: "Credenciais invalidas." });
    return;
  }

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
  response.json(await readState());
});

app.put("/api/state", async (request, response) => {
  response.json(await writeState(request.body || {}));
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
