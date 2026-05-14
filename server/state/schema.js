export const CURRENT_API_VERSION = "v1";
export const CURRENT_PAYLOAD_VERSION = "2026-05-14";
export const CURRENT_STATE_SCHEMA_VERSION = 2;

function toPositiveInteger(value, fallback) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 1) return fallback;
  return normalized;
}

export function getDefaultDomainVersions() {
  return {
    users: 1,
    departments: 1,
    locations: 1,
    tickets: 1,
    assets: 1,
    brands: 1,
    models: 1,
    projects: 1,
    knowledgeArticles: 1,
    apiConfigs: 1,
    emailLayouts: 1,
    notificationRules: 1,
    notificationLogs: 1,
    reports: 1,
    permissionCatalog: 1,
    permissionProfiles: 1,
    navigationSections: 1,
    notificationEvents: 1,
    emailPlaceholders: 1,
    smtpSettings: 1,
    emailServiceSettings: 1,
    serviceCenter: 1,
    queues: 1,
  };
}

export function ensureStateSchema(stored = {}) {
  const baseState = stored && typeof stored === "object" ? { ...stored } : {};
  const previousSchemaVersion = toPositiveInteger(baseState.schemaVersion, 1);
  const nowIso = new Date().toISOString();
  const migrationHistory = Array.isArray(baseState.migrationHistory) ? [...baseState.migrationHistory] : [];

  let nextState = {
    ...baseState,
    schemaVersion: previousSchemaVersion,
    payloadVersion: String(baseState.payloadVersion || CURRENT_PAYLOAD_VERSION).trim() || CURRENT_PAYLOAD_VERSION,
    schemaUpdatedAt: String(baseState.schemaUpdatedAt || nowIso),
    domainVersions: {
      ...getDefaultDomainVersions(),
      ...(baseState.domainVersions && typeof baseState.domainVersions === "object" ? baseState.domainVersions : {}),
    },
    migrationHistory,
  };

  if (previousSchemaVersion < 2) {
    nextState = {
      ...nextState,
      schemaVersion: 2,
      payloadVersion: CURRENT_PAYLOAD_VERSION,
      schemaUpdatedAt: nowIso,
      migrationHistory: [
        ...migrationHistory,
        {
          version: 2,
          appliedAt: nowIso,
          description: "Introduz schemaVersion, payloadVersion e domainVersions para a API versionada.",
        },
      ],
    };
  }

  if (nextState.schemaVersion < CURRENT_STATE_SCHEMA_VERSION) {
    nextState = {
      ...nextState,
      schemaVersion: CURRENT_STATE_SCHEMA_VERSION,
      payloadVersion: CURRENT_PAYLOAD_VERSION,
      schemaUpdatedAt: nowIso,
    };
  }

  return nextState;
}

export function buildStateMeta(state = {}) {
  const normalizedState = ensureStateSchema(state);
  return {
    apiVersion: CURRENT_API_VERSION,
    payloadVersion: normalizedState.payloadVersion,
    schemaVersion: normalizedState.schemaVersion,
    schemaUpdatedAt: normalizedState.schemaUpdatedAt,
    domainVersions: normalizedState.domainVersions,
  };
}
