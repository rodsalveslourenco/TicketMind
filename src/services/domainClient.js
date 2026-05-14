import { requestEnvelope } from "../lib/api.js";

export async function getApiMeta() {
  return requestEnvelope("/api/v1/meta");
}

export async function listDomainItems(domainKey, query = "") {
  const path = query ? `/api/v1/${domainKey}?${query}` : `/api/v1/${domainKey}`;
  return requestEnvelope(path);
}

export async function getDomainItem(domainKey, itemId) {
  return requestEnvelope(`/api/v1/${domainKey}/${encodeURIComponent(itemId)}`);
}
