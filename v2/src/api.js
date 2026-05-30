// Cliente de API do TicketMind 2 — consome a MESMA API/banco do TicketMind.
const CLIENT_ID = `tm2-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-TicketMind-Client": CLIENT_ID, ...(options.headers || {}) },
    ...options,
  });
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
  createTicket: (payload) => request("/api/v1/tickets", { method: "POST", body: JSON.stringify(payload) }),
  createCollectionItem: (domain, item) => request(`/api/collections/${encodeURIComponent(domain)}`, { method: "POST", body: JSON.stringify(item) }),
  saveCollectionItem: (domain, id, item) => request(`/api/collections/${encodeURIComponent(domain)}/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(item) }),
  removeCollectionItem: (domain, id) => request(`/api/collections/${encodeURIComponent(domain)}/${encodeURIComponent(id)}`, { method: "DELETE" }),
  saveSingleton: (key, value) => request(`/api/singletons/${encodeURIComponent(key)}`, { method: "PUT", body: JSON.stringify(value) }),
  createV1: (domain, item) => request(`/api/v1/${encodeURIComponent(domain)}`, { method: "POST", body: JSON.stringify(item) }),
  saveV1: (domain, id, item) => request(`/api/v1/${encodeURIComponent(domain)}/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(item) }),
  deleteV1: (domain, id) => request(`/api/v1/${encodeURIComponent(domain)}/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
