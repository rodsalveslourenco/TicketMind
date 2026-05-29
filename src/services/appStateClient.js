import { requestJson } from "../lib/api.js";

const REALTIME_CLIENT_ID = `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export function getRealtimeClientId() {
  return REALTIME_CLIENT_ID;
}

export async function loadAppState() {
  return requestJson("/api/state");
}

export async function persistAppState(nextState) {
  return requestJson("/api/state", {
    method: "PUT",
    headers: {
      "X-TicketMind-Client": REALTIME_CLIENT_ID,
    },
    body: JSON.stringify(nextState),
  });
}

export async function createTicketRequest(payload) {
  const envelope = await requestJson("/api/v1/tickets", {
    method: "POST",
    headers: {
      "X-TicketMind-Client": REALTIME_CLIENT_ID,
    },
    body: JSON.stringify(payload),
  });
  return envelope?.data || null;
}

export async function loadPublicIntake(accessToken) {
  return requestJson(`/api/public/intake/${encodeURIComponent(accessToken)}`);
}

export async function lookupPublicRequester(accessToken, email) {
  return requestJson(`/api/public/intake/${encodeURIComponent(accessToken)}/requester?email=${encodeURIComponent(email)}`);
}

export async function createPublicTicketRequest(accessToken, payload) {
  const envelope = await requestJson(`/api/public/intake/${encodeURIComponent(accessToken)}/tickets`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return envelope?.data || null;
}

export async function sendNotificationTestRequest(payload) {
  return requestJson("/api/notifications/test", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
