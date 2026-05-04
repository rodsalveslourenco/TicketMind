const SESSION_STORAGE_KEY = "ticketmind-session";
const PERSISTENT_STORAGE_KEY = "ticketmind-session-persistent";

function getSessionUserId() {
  if (typeof window === "undefined") return "";
  try {
    const rawSession = window.localStorage.getItem(PERSISTENT_STORAGE_KEY) || window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    const session = rawSession ? JSON.parse(rawSession) : null;
    return String(session?.userId || "").trim();
  } catch {
    return "";
  }
}

async function readJsonSafely(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Resposta invalida do servidor.");
  }
}

export async function requestJson(path, options = {}) {
  const sessionUserId = getSessionUserId();
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(sessionUserId ? { "x-user-id": sessionUserId } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    let detail = "Falha na comunicacao com o servidor.";
    try {
      const payload = await readJsonSafely(response);
      detail = payload?.error || detail;
    } catch {
      // Keep fallback error message when no JSON body is returned.
    }
    throw new Error(detail);
  }

  if (response.status === 204) return null;
  return readJsonSafely(response);
}
