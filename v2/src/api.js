// Cliente de API do TicketMind 2 — consome a MESMA API/banco do TicketMind.
const CLIENT_ID = `tm2-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// Auto-retry para indisponibilidade transitoria do banco (HTTP 503) e falhas de
// rede. Cobre o cold start do servidor/banco sem o usuario ver erro: o 503 do
// servidor so ocorre em erro de CONEXAO (pre-commit), entao repetir e seguro,
// inclusive para POST/PUT (upsert por id no servidor).
const REQUEST_RETRY_ATTEMPTS = 4;
const REQUEST_RETRY_BASE_MS = 500;
const REQUEST_RETRY_MAX_MS = 3000;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(path, options = {}, attempt = 1) {
  let response;
  try {
    response = await fetch(path, {
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-TicketMind-Client": CLIENT_ID, ...(options.headers || {}) },
      ...options,
    });
  } catch (networkError) {
    // Falha de rede (servidor acordando, queda momentanea): tenta de novo.
    if (attempt < REQUEST_RETRY_ATTEMPTS) {
      await wait(Math.min(REQUEST_RETRY_MAX_MS, REQUEST_RETRY_BASE_MS * 2 ** (attempt - 1)));
      return request(path, options, attempt + 1);
    }
    throw networkError;
  }

  if (response.status === 503 && attempt < REQUEST_RETRY_ATTEMPTS) {
    await wait(Math.min(REQUEST_RETRY_MAX_MS, REQUEST_RETRY_BASE_MS * 2 ** (attempt - 1)));
    return request(path, options, attempt + 1);
  }

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }
  if (!response.ok) {
    const message = payload?.error || `Falha na requisicao (${response.status}).`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return payload;
}

export const api = {
  login: (email, password) => request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  session: () => request("/api/auth/session"),
  logout: () => request("/api/auth/logout", { method: "POST" }),
  state: () => request("/api/state"),
  saveTicket: (id, ticket) => request(`/api/tickets/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(ticket) }),
  deleteTicket: (id) => request(`/api/tickets/${encodeURIComponent(id)}`, { method: "DELETE" }),
  createTicket: (payload) => request("/api/v1/tickets", { method: "POST", body: JSON.stringify(payload) }),
  createCollectionItem: (domain, item) => request(`/api/collections/${encodeURIComponent(domain)}`, { method: "POST", body: JSON.stringify(item) }),
  saveCollectionItem: (domain, id, item) => request(`/api/collections/${encodeURIComponent(domain)}/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(item) }),
  removeCollectionItem: (domain, id) => request(`/api/collections/${encodeURIComponent(domain)}/${encodeURIComponent(id)}`, { method: "DELETE" }),
  saveSingleton: (key, value) => request(`/api/singletons/${encodeURIComponent(key)}`, { method: "PUT", body: JSON.stringify(value) }),
  changePassword: (currentPassword, newPassword) => request("/api/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }),
  publicIntake: (token) => request(`/api/public/intake/${encodeURIComponent(token)}`),
  createPublicTicket: (token, payload) => request(`/api/public/intake/${encodeURIComponent(token)}/tickets`, { method: "POST", body: JSON.stringify(payload) }),
  publicRequester: (token, email) => request(`/api/public/intake/${encodeURIComponent(token)}/requester?email=${encodeURIComponent(email)}`),
  createV1: (domain, item) => request(`/api/v1/${encodeURIComponent(domain)}`, { method: "POST", body: JSON.stringify(item) }),
  saveV1: (domain, id, item) => request(`/api/v1/${encodeURIComponent(domain)}/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(item) }),
  deleteV1: (domain, id) => request(`/api/v1/${encodeURIComponent(domain)}/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
