export async function requestJson(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    let detail = "Falha na comunicacao com o servidor.";
    try {
      const payload = await response.json();
      detail = payload.error || detail;
    } catch {
      // Keep fallback error message when no JSON body is returned.
    }
    throw new Error(detail);
  }

  if (response.status === 204) return null;
  return response.json();
}
