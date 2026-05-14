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

export async function sendNotificationTestRequest(payload) {
  return requestJson("/api/notifications/test", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
