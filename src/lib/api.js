const AUTH_EXPIRED_EVENT = "ticketmind:auth-expired";

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
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }

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
