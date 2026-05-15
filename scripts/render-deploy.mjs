import { spawnSync } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

const apiBaseUrl = process.env.RENDER_API_BASE_URL || "https://api.render.com/v1";
const serviceId = String(process.env.RENDER_SERVICE_ID || "").trim();
const apiKey = String(process.env.RENDER_API_KEY || "").trim();
const skipValidate = process.argv.includes("--skip-validate");
const pollIntervalMs = 5000;
const deployTimeoutMs = 15 * 60 * 1000;

function fail(message) {
  throw new Error(message);
}

async function renderRequest(path, { method = "GET", body } = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payloadText = await response.text();
  let payload = null;
  if (payloadText) {
    try {
      payload = JSON.parse(payloadText);
    } catch {
      payload = { raw: payloadText };
    }
  }

  if (!response.ok) {
    fail(`Render API ${method} ${path} failed with HTTP ${response.status}: ${payload?.message || payloadText}`.trim());
  }

  return payload;
}

function runValidation() {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  console.log("Running release validation before Render deploy...");
  const result = spawnSync(npmCommand, ["run", "validate"], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function readHeadCommitSha() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  if (result.error || result.status !== 0) {
    return "";
  }

  return String(result.stdout || "").trim();
}

function normalizeDeployList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.value)) return payload.value;
  return [];
}

async function main() {
  if (!skipValidate) {
    runValidation();
  }

  if (!apiKey) fail("RENDER_API_KEY is required.");
  if (!serviceId) fail("RENDER_SERVICE_ID is required.");

  console.log(`Triggering Render deploy for service ${serviceId}...`);
  const expectedCommitSha = readHeadCommitSha();
  const beforeList = await renderRequest(`/services/${serviceId}/deploys`);
  const normalizedBeforeList = normalizeDeployList(beforeList);
  const latestBeforeId = String(normalizedBeforeList[0]?.deploy?.id || "").trim();
  const latestBeforeUpdatedAt = String(normalizedBeforeList[0]?.deploy?.updatedAt || "").trim();

  const deploy = await renderRequest(`/services/${serviceId}/deploys`, { method: "POST", body: {} });
  let deployId = String(deploy?.id || "").trim();

  if (!deployId) {
    const startedLookupAt = Date.now();
    while (!deployId && Date.now() - startedLookupAt < 30000) {
      await delay(3000);
      const afterList = await renderRequest(`/services/${serviceId}/deploys`);
      const normalizedAfterList = normalizeDeployList(afterList);
      const matchedDeploy =
        normalizedAfterList.find((entry) => String(entry?.deploy?.commit?.id || "").trim() === expectedCommitSha)?.deploy || null;
      const latestDeploy = matchedDeploy || normalizedAfterList[0]?.deploy || null;
      const candidateId = String(latestDeploy?.id || "").trim();
      const candidateUpdatedAt = String(latestDeploy?.updatedAt || "").trim();

      if (
        candidateId &&
        (candidateId !== latestBeforeId ||
          candidateUpdatedAt !== latestBeforeUpdatedAt ||
          String(latestDeploy?.commit?.id || "").trim() === expectedCommitSha)
      ) {
        deployId = candidateId;
      }
    }
  }

  if (!deployId) fail("Render deploy trigger did not return a deploy id.");

  console.log(`Render deploy triggered: ${deployId}`);

  const deadline = Date.now() + deployTimeoutMs;
  while (Date.now() < deadline) {
    await delay(pollIntervalMs);
    const current = await renderRequest(`/services/${serviceId}/deploys/${deployId}`);
    const status = String(current?.status || "").trim().toLowerCase();
    console.log(`Render deploy status: ${status || "unknown"}`);

    if (status === "live") {
      console.log(`Render deploy is live: ${deployId}`);
      return;
    }

    if (["build_failed", "update_failed", "canceled", "deactivated", "failed"].includes(status)) {
      fail(`Render deploy ended with status ${status}.`);
    }
  }

  fail(`Timed out waiting for Render deploy ${deployId}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
