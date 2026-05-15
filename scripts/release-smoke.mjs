import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

const rootDir = process.cwd();
const port = Number(process.env.SMOKE_PORT || 3310);
const dbDir = path.join(rootDir, ".tmp-release-validation");
const dbPath = path.join(dbDir, `ticketmind-smoke-${Date.now()}.sqlite`);
const baseUrl = `http://127.0.0.1:${port}`;
const adminEmail = process.env.SMOKE_ADMIN_EMAIL || "admin@ticketmind.local";
const adminPassword = process.env.SMOKE_ADMIN_PASSWORD || "admin0123";

function fail(message) {
  throw new Error(message);
}

async function requestJson(url, { method = "GET", headers = {}, body, expectedStatus } = {}) {
  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payloadText = await response.text();
  const payload = payloadText ? JSON.parse(payloadText) : null;

  if (expectedStatus && response.status !== expectedStatus) {
    fail(`Expected HTTP ${expectedStatus} for ${method} ${url}, got ${response.status}.`);
  }

  if (!response.ok) {
    fail(`Request failed for ${method} ${url}: HTTP ${response.status} ${payload?.error || payloadText}`.trim());
  }

  return { response, payload };
}

async function waitForHealth() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // server still starting
    }
    await delay(500);
  }
  fail("Timed out waiting for local server healthcheck.");
}

async function main() {
  await mkdir(dbDir, { recursive: true });

  const server = spawn(process.execPath, ["server/index.js"], {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: String(port),
      DB_PATH: dbPath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  server.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  let ticketId = "";
  let cookie = "";

  try {
    await waitForHealth();

    const login = await requestJson(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: { email: adminEmail, password: adminPassword },
      expectedStatus: 200,
    });

    cookie = login.response.headers.get("set-cookie")?.split(";")[0] || "";
    if (!cookie) fail("Login succeeded but no session cookie was returned.");

    const session = await requestJson(`${baseUrl}/api/auth/session`, {
      headers: { Cookie: cookie },
      expectedStatus: 200,
    });

    const sessionUser = session.payload?.user;
    if (!sessionUser?.id) fail("Authenticated session did not return a valid user.");

    await requestJson(`${baseUrl}/api/v1/tickets`, {
      headers: { Cookie: cookie },
      expectedStatus: 200,
    });

    const createTicket = await requestJson(`${baseUrl}/api/v1/tickets`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: {
        title: `Smoke validation ${Date.now()}`,
        description: "Ticket temporario criado pela validacao automatizada de release.",
        status: "Aberto",
        priority: "Media",
        category: "Infraestrutura",
        type: "Incidente",
        source: "smoke",
        queue: "Triagem",
        requester: sessionUser.name,
        requesterId: sessionUser.id,
        department: sessionUser.department || "TI",
        departmentId: sessionUser.departmentId || "",
        location: "Laboratorio",
        openedAt: new Date().toISOString(),
        assignee: "",
        watchers: [],
        watcherDetails: [],
        followUps: [],
      },
      expectedStatus: 201,
    });

    ticketId = createTicket.payload?.data?.id || createTicket.payload?.id || "";
    if (!ticketId) fail("Ticket creation succeeded but no ticket id was returned.");

    await requestJson(`${baseUrl}/api/v1/tickets/${ticketId}`, {
      headers: { Cookie: cookie },
      expectedStatus: 200,
    });

    await requestJson(`${baseUrl}/api/v1/tickets/${ticketId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: {
        id: ticketId,
        assignee: sessionUser.name,
        status: "Em andamento",
        priority: "Alta",
      },
      expectedStatus: 200,
    });

    await requestJson(`${baseUrl}/api/v1/tickets/${ticketId}`, {
      method: "DELETE",
      headers: { Cookie: cookie },
      expectedStatus: 204,
    });

    await requestJson(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { Cookie: cookie },
      expectedStatus: 204,
    });

    console.log(`Release smoke passed on ${baseUrl}.`);
  } finally {
    if (ticketId && cookie) {
      try {
        await fetch(`${baseUrl}/api/v1/tickets/${ticketId}`, {
          method: "DELETE",
          headers: { Cookie: cookie },
        });
      } catch {
        // best effort cleanup
      }
    }

    server.kill("SIGTERM");
    await new Promise((resolve) => {
      server.once("exit", resolve);
      setTimeout(resolve, 5000);
    });

    await rm(dbPath, { force: true }).catch(() => {});

    if (stderr.trim()) {
      const normalized = stderr.trim();
      if (normalized && !normalized.includes("ExperimentalWarning")) {
        process.stderr.write(`${normalized}\n`);
      }
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
