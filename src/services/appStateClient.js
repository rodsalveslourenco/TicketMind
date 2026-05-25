import { requestJson } from "../lib/api.js";

export async function loadAppState() {
  return requestJson("/api/state");
}

export async function persistAppState(nextState) {
  return requestJson("/api/state", {
    method: "PUT",
    body: JSON.stringify(nextState),
  });
}

export async function createTicketRequest(payload) {
  const envelope = await requestJson("/api/v1/tickets", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return envelope?.data || null;
}

export async function loadPublicIntake(accessToken) {
  return requestJson(`/api/public/intake/${encodeURIComponent(accessToken)}`);
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
