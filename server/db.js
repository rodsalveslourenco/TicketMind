import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import initSqlJs from "sql.js";
import { seedData } from "../src/data/seedData.js";
import { normalizeDepartmentColor } from "../src/data/departments.js";
import { getUserPermissionProfile, hydratePermissionProfiles, normalizeRoleName, normalizeUserPermissions } from "../src/data/permissions.js";
import { normalizeKnowledgeArticle, syncHelpdeskState } from "../src/data/helpdesk.js";
import {
  defaultEmailPlaceholders,
  defaultEmailServiceSettings,
  defaultNavigationSections,
  defaultNotificationEvents,
  defaultPermissionCatalog,
  defaultPermissionProfiles,
  defaultServiceCenterSettings,
  defaultSmtpSettings,
} from "../src/data/systemDefaults.js";
import { CURRENT_PAYLOAD_VERSION, CURRENT_STATE_SCHEMA_VERSION, ensureStateSchema } from "./state/schema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const dataDir = process.env.DB_DIR ? path.resolve(process.env.DB_DIR) : path.join(rootDir, "data");
const dbPath = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(dataDir, "ticketmind.sqlite");
const wasmPath = path.join(rootDir, "node_modules", "sql.js", "dist");
const databaseUrl = String(process.env.DATABASE_URL || "").trim();

const staticSeedState = {
  ...seedData,
  currentUser: null,
  users: [],
  departments: [],
  locations: [],
};

const bootstrapSeedState = {
  ...seedData,
  currentUser: null,
};

const DOMAIN_COLLECTION_KEYS = [
  "tickets",
  "assets",
  "brands",
  "models",
  "projects",
  "knowledgeArticles",
  "apiConfigs",
  "emailLayouts",
  "notificationRules",
  "notificationLogs",
  "reports",
];

const DOMAIN_SINGLETON_KEYS = [
  "permissionCatalog",
  "permissionProfiles",
  "navigationSections",
  "notificationEvents",
  "emailPlaceholders",
  "smtpSettings",
  "emailServiceSettings",
  "serviceCenter",
  "queues",
];

const DOMAIN_TABLES = {
  tickets: "tickets_domain",
  assets: "assets_domain",
  brands: "brands_domain",
  models: "models_domain",
  projects: "projects_domain",
  knowledgeArticles: "knowledge_articles_domain",
  apiConfigs: "api_configs_domain",
  emailLayouts: "email_layouts_domain",
  notificationRules: "notification_rules_domain",
  notificationLogs: "notification_logs_domain",
  reports: "reports_domain",
};

const DOMAIN_SINGLETON_TABLE = "app_singletons";

function normalizeCode(value, fallback = "") {
  const baseValue = String(value || fallback || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim();
  const normalized = baseValue
    .split(/\s+/)
    .filter(Boolean)
    .join("-")
    .toUpperCase();
  return normalized || fallback || "SEM-CODIGO";
}

function normalizeDepartmentRecord(record = {}) {
  const nowIso = new Date().toISOString();
  const name = String(record.name || record.department || "").trim();
  return {
    id: String(record.id || "").trim(),
    code: normalizeCode(record.code || name, "DEP"),
    name,
    color: normalizeDepartmentColor(record.color || ""),
    status: String(record.status || "Ativo").trim() || "Ativo",
    createdAt: String(record.createdAt || nowIso),
    updatedAt: String(record.updatedAt || nowIso),
  };
}

function normalizeLocationRecord(record = {}, departments = []) {
  const nowIso = new Date().toISOString();
  const departmentId = String(record.departmentId || "").trim();
  const departmentName = String(record.department || "").trim();
  const matchedDepartment =
    (departmentId ? departments.find((department) => department.id === departmentId) : null) ||
    departments.find(
      (department) =>
        normalizeText(department.name) === normalizeText(departmentName) ||
        normalizeText(department.code) === normalizeText(departmentName),
    ) ||
    null;

  return {
    id: String(record.id || "").trim(),
    code: normalizeCode(record.code || record.name, "LOC"),
    name: String(record.name || record.location || "").trim(),
    departmentId: matchedDepartment?.id || departmentId,
    department: matchedDepartment?.name || departmentName,
    status: String(record.status || "Ativo").trim() || "Ativo",
    createdAt: String(record.createdAt || nowIso),
    updatedAt: String(record.updatedAt || nowIso),
  };
}

function normalizeUserRecord(
  record = {},
  departments = [],
  permissionCatalog = defaultPermissionCatalog,
  permissionProfiles = defaultPermissionProfiles,
) {
  const nowIso = new Date().toISOString();
  const departmentId = String(record.departmentId || "").trim();
  const departmentName = String(record.department || "").trim();
  const matchedDepartment =
    (departmentId ? departments.find((department) => department.id === departmentId) : null) ||
    departments.find(
      (department) =>
        normalizeText(department.name) === normalizeText(departmentName) ||
        normalizeText(department.code) === normalizeText(departmentName),
    ) ||
    null;

  const permissionProfile =
    getUserPermissionProfile(
      {
        permissionProfileId: record.permissionProfileId,
        role: record.role,
      },
      permissionProfiles,
    ) || null;
  const normalizedRole = permissionProfile?.name || normalizeRoleName(record.role);

  const normalizedRecord = {
    id: String(record.id || "").trim(),
    name: String(record.name || "").trim(),
    email: String(record.email || "").trim().toLowerCase(),
    password: String(record.password || "").trim(),
    status: String(record.status || "Ativo").trim() || "Ativo",
    role: normalizedRole,
    permissionProfileId: String(permissionProfile?.id || record.permissionProfileId || "").trim(),
    team: String(record.team || "").trim(),
    departmentId: matchedDepartment?.id || departmentId,
    department: matchedDepartment?.name || departmentName,
    avatar: String(record.avatar || "").trim(),
    additionalPermissions: record.additionalPermissions && typeof record.additionalPermissions === "object" ? record.additionalPermissions : {},
    restrictedPermissions: record.restrictedPermissions && typeof record.restrictedPermissions === "object" ? record.restrictedPermissions : {},
    permissions: normalizeUserPermissions(
      record.permissions || {},
      {
        ...record,
        role: normalizedRole,
        permissionProfileId: permissionProfile?.id || record.permissionProfileId,
      },
      permissionCatalog,
      permissionProfiles,
    ),
    createdAt: String(record.createdAt || nowIso),
    updatedAt: String(record.updatedAt || nowIso),
  };

  return normalizedRecord;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function buildStateDefaults(stored = {}) {
  const versionedState = ensureStateSchema(stored);
  const currentUser = versionedState.currentUser && typeof versionedState.currentUser === "object" ? versionedState.currentUser : null;

  return {
    ...staticSeedState,
    ...versionedState,
    currentUser,
    schemaVersion: versionedState.schemaVersion || CURRENT_STATE_SCHEMA_VERSION,
    payloadVersion: versionedState.payloadVersion || CURRENT_PAYLOAD_VERSION,
    schemaUpdatedAt: versionedState.schemaUpdatedAt || new Date().toISOString(),
    domainVersions: versionedState.domainVersions,
    migrationHistory: Array.isArray(versionedState.migrationHistory) ? versionedState.migrationHistory : [],
    permissionCatalog:
      Array.isArray(versionedState.permissionCatalog) && versionedState.permissionCatalog.length
        ? versionedState.permissionCatalog
        : defaultPermissionCatalog,
    permissionProfiles:
      Array.isArray(versionedState.permissionProfiles) && versionedState.permissionProfiles.length
        ? hydratePermissionProfiles(versionedState.permissionProfiles)
        : hydratePermissionProfiles(defaultPermissionProfiles),
    navigationSections:
      Array.isArray(versionedState.navigationSections) && versionedState.navigationSections.length
        ? versionedState.navigationSections
        : defaultNavigationSections,
    notificationEvents:
      Array.isArray(versionedState.notificationEvents) && versionedState.notificationEvents.length
        ? versionedState.notificationEvents
        : defaultNotificationEvents,
    emailPlaceholders:
      Array.isArray(versionedState.emailPlaceholders) && versionedState.emailPlaceholders.length
        ? versionedState.emailPlaceholders
        : defaultEmailPlaceholders,
    emailLayouts: Array.isArray(versionedState.emailLayouts) ? versionedState.emailLayouts : [],
    notificationRules: Array.isArray(versionedState.notificationRules) ? versionedState.notificationRules : [],
    notificationLogs: Array.isArray(versionedState.notificationLogs) ? versionedState.notificationLogs : [],
    smtpSettings:
      versionedState.smtpSettings && typeof versionedState.smtpSettings === "object"
        ? { ...defaultSmtpSettings, ...versionedState.smtpSettings }
        : defaultSmtpSettings,
    emailServiceSettings:
      versionedState.emailServiceSettings && typeof versionedState.emailServiceSettings === "object"
        ? { ...defaultEmailServiceSettings, ...versionedState.emailServiceSettings }
        : defaultEmailServiceSettings,
    serviceCenter:
      versionedState.serviceCenter && typeof versionedState.serviceCenter === "object"
        ? { ...defaultServiceCenterSettings, ...versionedState.serviceCenter }
        : defaultServiceCenterSettings,
    users: Array.isArray(versionedState.users) ? versionedState.users : [],
    departments: Array.isArray(versionedState.departments) ? versionedState.departments : [],
    locations: Array.isArray(versionedState.locations) ? versionedState.locations : [],
    queues: Array.isArray(versionedState.queues) ? versionedState.queues : staticSeedState.queues,
    tickets: Array.isArray(versionedState.tickets) ? versionedState.tickets : staticSeedState.tickets,
    assets: Array.isArray(versionedState.assets) ? versionedState.assets : staticSeedState.assets,
    brands: Array.isArray(versionedState.brands) ? versionedState.brands : staticSeedState.brands,
    models: Array.isArray(versionedState.models) ? versionedState.models : staticSeedState.models,
    projects: Array.isArray(versionedState.projects) ? versionedState.projects : staticSeedState.projects,
    knowledgeArticles: (Array.isArray(versionedState.knowledgeArticles) ? versionedState.knowledgeArticles : staticSeedState.knowledgeArticles).map(normalizeKnowledgeArticle),
    apiConfigs: Array.isArray(versionedState.apiConfigs) ? versionedState.apiConfigs : staticSeedState.apiConfigs,
    reports: Array.isArray(versionedState.reports) ? versionedState.reports : staticSeedState.reports,
  };
}

function pickDomainCollections(state = {}) {
  return DOMAIN_COLLECTION_KEYS.reduce(
    (accumulator, key) => ({
      ...accumulator,
      [key]: Array.isArray(state?.[key]) ? state[key] : [],
    }),
    {},
  );
}

function pickDomainSingletons(state = {}) {
  return DOMAIN_SINGLETON_KEYS.reduce((accumulator, key) => {
    const value = state?.[key];
    return {
      ...accumulator,
      [key]:
        value && typeof value === "object" && !Array.isArray(value)
          ? value
          : Array.isArray(value)
            ? value
            : value ?? null,
    };
  }, {});
}

function buildLegacyAppStatePayload(state = {}) {
  const baseState = buildStateDefaults(state);
  return {
    ...stripNormalizedCollections(baseState),
    ...pickDomainCollections(baseState),
    ...pickDomainSingletons(baseState),
  };
}

function shouldBackfillDomainStorage(domainCollections = {}, singletonState = {}) {
  const missingCollections = Object.values(domainCollections).some((value) => value == null);
  const missingSingletons = DOMAIN_SINGLETON_KEYS.some((key) => !(key in singletonState));
  return missingCollections || missingSingletons;
}

function createUniqueIdResolver(prefix) {
  const usedIds = new Set();
  return (preferredId) => {
    const normalizedId = String(preferredId || "").trim();
    if (normalizedId && !usedIds.has(normalizedId)) {
      usedIds.add(normalizedId);
      return normalizedId;
    }

    let nextIndex = Math.max(usedIds.size + 1, 1);
    let candidate = `${prefix}-${nextIndex}`;
    while (usedIds.has(candidate)) {
      nextIndex += 1;
      candidate = `${prefix}-${nextIndex}`;
    }
    usedIds.add(candidate);
    return candidate;
  };
}

function sanitizeDepartmentCollection(records = []) {
  const registry = new Map();
  const resolveId = createUniqueIdResolver("dep");

  records.forEach((record) => {
    const normalized = normalizeDepartmentRecord(record);
    if (!normalized.name) return;

    const key = normalizeText(normalized.name) || normalizeText(normalized.code);
    if (registry.has(key)) return;

    registry.set(key, {
      ...normalized,
      id: resolveId(normalized.id),
    });
  });

  return Array.from(registry.values());
}

function sanitizeLocationCollection(records = [], departments = []) {
  const registry = new Map();
  const resolveId = createUniqueIdResolver("loc");

  records.forEach((record) => {
    const normalized = normalizeLocationRecord(record, departments);
    if (!normalized.name) return;

    const key = normalizeText(normalized.name);
    if (registry.has(key)) return;

    registry.set(key, {
      ...normalized,
      id: resolveId(normalized.id),
    });
  });

  return Array.from(registry.values());
}

function sanitizeUserCollection(
  records = [],
  departments = [],
  permissionCatalog = defaultPermissionCatalog,
  permissionProfiles = defaultPermissionProfiles,
) {
  const registry = new Map();
  const resolveId = createUniqueIdResolver("u");

  records.forEach((record) => {
    const normalized = normalizeUserRecord(record, departments, permissionCatalog, permissionProfiles);
    if (!normalized.email) return;

    const key = normalizeText(normalized.email);
    if (registry.has(key)) return;

    registry.set(key, {
      ...normalized,
      id: resolveId(normalized.id),
    });
  });

  return Array.from(registry.values());
}

function buildCombinedState(appStateRaw = {}, collections = {}) {
  const permissionCatalog =
    Array.isArray(appStateRaw?.permissionCatalog) && appStateRaw.permissionCatalog.length
      ? appStateRaw.permissionCatalog
      : defaultPermissionCatalog;
  const permissionProfiles =
    Array.isArray(appStateRaw?.permissionProfiles) && appStateRaw.permissionProfiles.length
      ? hydratePermissionProfiles(appStateRaw.permissionProfiles)
      : hydratePermissionProfiles(defaultPermissionProfiles);
  const departments = sanitizeDepartmentCollection(collections.departments || []);
  const locations = sanitizeLocationCollection(collections.locations || [], departments);
  const users = sanitizeUserCollection(collections.users || [], departments, permissionCatalog, permissionProfiles);

  const state = buildStateDefaults({
    ...appStateRaw,
    users,
    departments,
    locations,
    currentUser:
      appStateRaw?.currentUser && typeof appStateRaw.currentUser === "object"
        ? normalizeUserRecord(appStateRaw.currentUser, departments, permissionCatalog, permissionProfiles)
        : null,
  });

  return syncHelpdeskState(state, users);
}

function stripNormalizedCollections(state = {}) {
  return {
    ...(state || {}),
    currentUser: state?.currentUser || null,
    users: Array.isArray(state?.users) ? state.users : [],
    departments: Array.isArray(state?.departments) ? state.departments : [],
    locations: Array.isArray(state?.locations) ? state.locations : [],
  };
}

function deriveDepartments(records = {}) {
  const registry = new Map();
  const resolveId = createUniqueIdResolver("dep");
  const addDepartment = (entry) => {
    const normalized = normalizeDepartmentRecord(entry);
    if (!normalized.name) return;
    const key = normalizeText(normalized.name) || normalizeText(normalized.code);
    if (!registry.has(key)) {
      registry.set(key, {
        ...normalized,
        id: resolveId(normalized.id),
      });
    }
  };

  (records.departments || []).forEach(addDepartment);
  (records.users || []).forEach((user) => addDepartment({ name: user.department }));
  (records.locations || []).forEach((location) => addDepartment({ name: location.department }));

  return Array.from(registry.values());
}

function deriveLocations(records = {}, departments = []) {
  const registry = new Map();
  const resolveId = createUniqueIdResolver("loc");
  const addLocation = (entry) => {
    const normalized = normalizeLocationRecord(entry, departments);
    if (!normalized.name) return;
    const key = normalizeText(normalized.name);
    if (!registry.has(key)) {
      registry.set(key, {
        ...normalized,
        id: resolveId(normalized.id),
      });
    }
  };

  (records.locations || []).forEach(addLocation);
  (records.assets || []).forEach((asset) => addLocation({ name: asset.location }));
  (records.tickets || []).forEach((ticket) => addLocation({ name: ticket.location }));

  return Array.from(registry.values());
}

function deriveUsers(records = {}, departments = []) {
  const resolveId = createUniqueIdResolver("u");
  return (records.users || [])
    .map((user) => normalizeUserRecord({ ...user, id: resolveId(user.id) }, departments))
    .filter((user) => user.id && user.email);
}

function buildMigrationCollections(legacyState = {}) {
  const departments = deriveDepartments(legacyState);
  const locations = deriveLocations(legacyState, departments);
  const users = deriveUsers(legacyState, departments);
  return { departments, locations, users };
}

function buildSeedBootstrapCollections() {
  const bootstrapUsers = Array.isArray(seedData.users) ? seedData.users : [];
  const departments = sanitizeDepartmentCollection(seedData.departments || deriveDepartments({ users: bootstrapUsers }));
  const locations = sanitizeLocationCollection(
    seedData.locations?.length ? seedData.locations : deriveLocations({ assets: seedData.assets, tickets: seedData.tickets }, departments),
    departments,
  );
  const users = sanitizeUserCollection(bootstrapUsers, departments);
  return { departments, locations, users };
}

function isSeedUserEmail(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  return Boolean(normalizedEmail && normalizedEmail.endsWith("@ticketmind.local"));
}

function hasRealUsers(users = []) {
  return (Array.isArray(users) ? users : []).some((user) => !isSeedUserEmail(user?.email));
}

function isSeedOnlyUserCollection(users = []) {
  const normalizedUsers = Array.isArray(users) ? users.filter(Boolean) : [];
  return Boolean(normalizedUsers.length) && normalizedUsers.every((user) => isSeedUserEmail(user?.email));
}

function withSeedFallbackCollections(collections = {}) {
  const seedCollections = buildSeedBootstrapCollections();
  return {
    users: collections.users?.length ? collections.users : seedCollections.users,
    departments: collections.departments?.length ? collections.departments : seedCollections.departments,
    locations: collections.locations?.length ? collections.locations : seedCollections.locations,
  };
}

function hasCollectionRecords(collections = {}) {
  return Boolean(
    (Array.isArray(collections.users) && collections.users.length) ||
      (Array.isArray(collections.departments) && collections.departments.length) ||
      (Array.isArray(collections.locations) && collections.locations.length),
  );
}

function hasLegacyCollectionData(state = {}) {
  return Boolean(
    (Array.isArray(state.users) && state.users.length) ||
      (Array.isArray(state.departments) && state.departments.length) ||
      (Array.isArray(state.locations) && state.locations.length),
  );
}

function resolveBootstrapCollections(legacyState = null) {
  if (legacyState && Object.keys(legacyState).length) {
    const migratedCollections = buildMigrationCollections(legacyState);
    if (hasCollectionRecords(migratedCollections) || hasLegacyCollectionData(legacyState)) {
      return withSeedFallbackCollections(migratedCollections);
    }
    return buildSeedBootstrapCollections();
  }

  return buildSeedBootstrapCollections();
}

function resolveRecoveryCollections(...states) {
  for (const state of states) {
    if (!state || !Object.keys(state).length) continue;
    const migratedCollections = buildMigrationCollections(state);
    if (hasCollectionRecords(migratedCollections)) {
      return withSeedFallbackCollections(migratedCollections);
    }
  }

  return buildSeedBootstrapCollections();
}

function shouldHydrateMissingCollections(collections = {}) {
  return !collections.users?.length || !collections.departments?.length || !collections.locations?.length;
}

function mergeMissingCollections(currentCollections = {}, fallbackCollections = {}) {
  return {
    users: currentCollections.users?.length ? currentCollections.users : fallbackCollections.users || [],
    departments: currentCollections.departments?.length ? currentCollections.departments : fallbackCollections.departments || [],
    locations: currentCollections.locations?.length ? currentCollections.locations : fallbackCollections.locations || [],
  };
}

function isLegacyBootstrapUserCollection(collections = {}) {
  const users = Array.isArray(collections.users) ? collections.users : [];
  if (users.length !== 1) return false;

  const [user] = users;
  return (
    String(user?.email || "").trim().toLowerCase() === "admin@test.local" &&
    String(user?.password || "").trim() === "123"
  );
}

function protectProductionCollections(nextCollections = {}, existingCollections = {}) {
  const nextUsers = Array.isArray(nextCollections.users) ? nextCollections.users : [];
  const existingUsers = Array.isArray(existingCollections.users) ? existingCollections.users : [];
  const shouldPreserveUsers =
    hasRealUsers(existingUsers) &&
    (!nextUsers.length || isSeedOnlyUserCollection(nextUsers));

  if (!shouldPreserveUsers) return nextCollections;

  const nextDepartments = Array.isArray(nextCollections.departments) ? nextCollections.departments : [];
  const nextLocations = Array.isArray(nextCollections.locations) ? nextCollections.locations : [];
  const existingDepartments = Array.isArray(existingCollections.departments) ? existingCollections.departments : [];
  const existingLocations = Array.isArray(existingCollections.locations) ? existingCollections.locations : [];

  return {
    ...nextCollections,
    users: existingUsers,
    departments: nextDepartments.length ? nextDepartments : existingDepartments,
    locations: nextLocations.length ? nextLocations : existingLocations,
  };
}

let sqlitePromise = null;
let pgPool = null;
let pgSchemaPromise = null;

function isPostgresEnabled() {
  return Boolean(databaseUrl);
}

function sqliteTableHasColumn(db, tableName, columnName) {
  const table = String(tableName || "").trim();
  const column = String(columnName || "").trim().toLowerCase();
  if (!table || !column) return false;
  const result = db.exec(`PRAGMA table_info(${table})`);
  if (!result.length) return false;
  const nameIndex = result[0].columns.indexOf("name");
  if (nameIndex === -1) return false;
  return (result[0].values || []).some((row) => String(row[nameIndex] || "").trim().toLowerCase() === column);
}

async function getSqliteDb() {
  if (!sqlitePromise) {
    sqlitePromise = (async () => {
      fs.mkdirSync(dataDir, { recursive: true });
      const SQL = await initSqlJs({
        locateFile: (file) => path.join(wasmPath, file),
      });

      const existingBuffer = fs.existsSync(dbPath) ? fs.readFileSync(dbPath) : null;
      const db = existingBuffer ? new SQL.Database(existingBuffer) : new SQL.Database();
      db.run("PRAGMA foreign_keys = ON");
      db.run(`
        CREATE TABLE IF NOT EXISTS app_state (
          id INTEGER PRIMARY KEY,
          data TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS app_state_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          data TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS app_singletons (
          domain_key TEXT PRIMARY KEY,
          payload TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS departments (
          id TEXT PRIMARY KEY,
          code TEXT NOT NULL,
          name TEXT NOT NULL,
          color TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS locations (
          id TEXT PRIMARY KEY,
          code TEXT NOT NULL,
          name TEXT NOT NULL,
          department_id TEXT,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (department_id) REFERENCES departments(id)
        );
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          password TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'Ativo',
          role TEXT NOT NULL,
          permission_profile_id TEXT NOT NULL DEFAULT '',
          team TEXT NOT NULL,
          department_id TEXT,
          avatar TEXT NOT NULL DEFAULT '',
          additional_permissions TEXT NOT NULL DEFAULT '{}',
          restricted_permissions TEXT NOT NULL DEFAULT '{}',
          permissions TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (department_id) REFERENCES departments(id)
        );
        CREATE TABLE IF NOT EXISTS tickets_domain (
          id TEXT PRIMARY KEY,
          payload TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS assets_domain (
          id TEXT PRIMARY KEY,
          payload TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS brands_domain (
          id TEXT PRIMARY KEY,
          payload TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS models_domain (
          id TEXT PRIMARY KEY,
          payload TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS projects_domain (
          id TEXT PRIMARY KEY,
          payload TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS knowledge_articles_domain (
          id TEXT PRIMARY KEY,
          payload TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS api_configs_domain (
          id TEXT PRIMARY KEY,
          payload TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS email_layouts_domain (
          id TEXT PRIMARY KEY,
          payload TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS notification_rules_domain (
          id TEXT PRIMARY KEY,
          payload TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS notification_logs_domain (
          id TEXT PRIMARY KEY,
          payload TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS reports_domain (
          id TEXT PRIMARY KEY,
          payload TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS system_logs (
          id TEXT PRIMARY KEY,
          occurred_at TEXT NOT NULL,
          user_id TEXT,
          user_name TEXT NOT NULL,
          user_department TEXT NOT NULL,
          module TEXT NOT NULL,
          event_type TEXT NOT NULL,
          description TEXT NOT NULL,
          origin TEXT NOT NULL,
          status TEXT NOT NULL,
          metadata TEXT NOT NULL
        );
      `);
      if (!sqliteTableHasColumn(db, "departments", "color")) {
        db.run("ALTER TABLE departments ADD COLUMN color TEXT NOT NULL DEFAULT ''");
      }
      return db;
    })().catch((error) => {
      sqlitePromise = null;
      throw error;
    });
  }

  return sqlitePromise;
}

function persistSqliteDb(db) {
  const data = Buffer.from(db.export());
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dbPath, data);
}

function parseJson(value, fallback) {
  if (value == null || value === "") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function mapSystemLogRow(row = {}) {
  return {
    id: row.id,
    occurredAt: row.occurred_at || row.occurredAt,
    userId: row.user_id || row.userId || null,
    userName: row.user_name || row.userName || "",
    userDepartment: row.user_department || row.userDepartment || "",
    module: row.module || "",
    eventType: row.event_type || row.eventType || "",
    description: row.description || "",
    origin: row.origin || "",
    status: row.status || "",
    metadata: typeof row.metadata === "string" ? parseJson(row.metadata, {}) : row.metadata || {},
  };
}

function countSqliteRows(tableName) {
  return getSqliteDb().then((db) => {
    const result = db.exec(`SELECT COUNT(*) AS total FROM ${tableName}`);
    return Number(result?.[0]?.values?.[0]?.[0] || 0);
  });
}

function hasDomainRowsInSqlite(db, tableName) {
  const result = db.exec(`SELECT COUNT(*) AS total FROM ${tableName}`);
  return Number(result?.[0]?.values?.[0]?.[0] || 0) > 0;
}

function hasDomainRowsInPostgres(rows = []) {
  return Number(rows?.[0]?.total || 0) > 0;
}

function getDomainUpdatedAt(item = {}) {
  return String(item.updatedAtIso || item.updatedAt || item.openedAt || item.createdAt || new Date().toISOString());
}

function normalizeDomainItemId(key, item = {}, index = 0) {
  const preferredId = String(item?.id || "").trim();
  if (preferredId) return preferredId;
  return `${key}-${index + 1}`;
}

async function readSqliteDomainCollections() {
  const db = await getSqliteDb();
  const domainCollections = {};

  for (const [key, tableName] of Object.entries(DOMAIN_TABLES)) {
    if (!hasDomainRowsInSqlite(db, tableName)) {
      domainCollections[key] = null;
      continue;
    }
    const result = db.exec(`SELECT payload FROM ${tableName} ORDER BY updated_at DESC, id ASC`);
    domainCollections[key] =
      result?.[0]?.values?.map((valueRow) => parseJson(valueRow[0], null)).filter(Boolean) || [];
  }

  return domainCollections;
}

async function readSqliteSingletons() {
  const db = await getSqliteDb();
  const result = db.exec(`SELECT domain_key, payload FROM ${DOMAIN_SINGLETON_TABLE}`);
  const values = result?.[0]?.values || [];
  return values.reduce((accumulator, valueRow) => {
    const domainKey = String(valueRow[0] || "").trim();
    if (!domainKey) return accumulator;
    return {
      ...accumulator,
      [domainKey]: parseJson(valueRow[1], null),
    };
  }, {});
}

async function writeSqliteDomainCollections(state = {}) {
  const db = await getSqliteDb();

  for (const [key, tableName] of Object.entries(DOMAIN_TABLES)) {
    db.run(`DELETE FROM ${tableName}`);
    const items = Array.isArray(state?.[key]) ? state[key] : [];
    if (!items.length) continue;
    const insertStatement = db.prepare(`INSERT INTO ${tableName} (id, payload, updated_at) VALUES (?, ?, ?)`);
    items.forEach((item, index) => {
      insertStatement.run([
        normalizeDomainItemId(key, item, index),
        JSON.stringify(item),
        getDomainUpdatedAt(item),
      ]);
    });
    insertStatement.free();
  }
}

async function writeSqliteSingletons(state = {}) {
  const db = await getSqliteDb();
  db.run(`DELETE FROM ${DOMAIN_SINGLETON_TABLE}`);
  const nowIso = new Date().toISOString();
  const insertStatement = db.prepare(`INSERT INTO ${DOMAIN_SINGLETON_TABLE} (domain_key, payload, updated_at) VALUES (?, ?, ?)`);
  for (const key of DOMAIN_SINGLETON_KEYS) {
    const value = state?.[key];
    if (value === undefined) continue;
    insertStatement.run([key, JSON.stringify(value), nowIso]);
  }
  insertStatement.free();
}

async function readSqliteStateRaw() {
  const db = await getSqliteDb();
  const result = db.exec("SELECT data FROM app_state WHERE id = 1");
  const rawData = result?.[0]?.values?.[0]?.[0];
  return parseJson(rawData, null);
}

function mapSqliteUserRow(row = {}) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    password: row.password,
    status: row.status || "Ativo",
    role: row.role,
    permissionProfileId: row.permission_profile_id || "",
    team: row.team,
    departmentId: row.department_id || "",
    department: row.department_name || "",
    avatar: row.avatar || "",
    additionalPermissions: parseJson(row.additional_permissions, {}),
    restrictedPermissions: parseJson(row.restricted_permissions, {}),
    permissions: parseJson(row.permissions, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPostgresUserRow(row = {}) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    password: row.password,
    status: row.status || "Ativo",
    role: row.role,
    permissionProfileId: row.permission_profile_id || "",
    team: row.team,
    departmentId: row.department_id || "",
    department: row.department_name || "",
    avatar: row.avatar || "",
    additionalPermissions: row.additional_permissions || {},
    restrictedPermissions: row.restricted_permissions || {},
    permissions: row.permissions || {},
    createdAt: row.created_at?.toISOString?.() || row.created_at,
    updatedAt: row.updated_at?.toISOString?.() || row.updated_at,
  };
}

function readFirstSqliteRow(result = []) {
  const table = result?.[0];
  const valueRow = table?.values?.[0];
  if (!table || !valueRow) return null;
  return table.columns.reduce((accumulator, column, index) => ({ ...accumulator, [column]: valueRow[index] }), {});
}

async function readSqliteCollections() {
  const db = await getSqliteDb();
  const departmentsResult = db.exec("SELECT id, code, name, color, status, created_at, updated_at FROM departments ORDER BY name");
  const locationsResult = db.exec(`
    SELECT locations.id, locations.code, locations.name, locations.department_id, departments.name AS department_name,
           locations.status, locations.created_at, locations.updated_at
    FROM locations
    LEFT JOIN departments ON departments.id = locations.department_id
    ORDER BY locations.name
  `);
  const usersResult = db.exec(`
    SELECT users.id, users.name, users.email, users.password, users.status, users.role, users.permission_profile_id, users.team, users.department_id,
           departments.name AS department_name, users.avatar, users.additional_permissions, users.restricted_permissions, users.permissions, users.created_at, users.updated_at
    FROM users
    LEFT JOIN departments ON departments.id = users.department_id
    ORDER BY users.name
  `);

  const mapRows = (table, mapper) =>
    table?.values?.map((valueRow) => {
      const row = table.columns.reduce((accumulator, column, index) => ({ ...accumulator, [column]: valueRow[index] }), {});
      return mapper(row);
    }) || [];

  return {
    departments: mapRows(departmentsResult[0], (row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      color: row.color || "",
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    locations: mapRows(locationsResult[0], (row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      departmentId: row.department_id || "",
      department: row.department_name || "",
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    users: mapRows(usersResult[0], (row) => mapSqliteUserRow(row)),
  };
}

async function readSqliteUserByEmail(email) {
  await migrateSqliteCollectionsIfNeeded();
  const db = await getSqliteDb();
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return null;
  const row = readFirstSqliteRow(
    db.exec(
      `
        SELECT users.id, users.name, users.email, users.password, users.status, users.role, users.permission_profile_id, users.team, users.department_id,
               departments.name AS department_name, users.avatar, users.additional_permissions, users.restricted_permissions, users.permissions, users.created_at, users.updated_at
        FROM users
        LEFT JOIN departments ON departments.id = users.department_id
        WHERE LOWER(users.email) = LOWER(?)
        LIMIT 1
      `,
      [normalizedEmail],
    ),
  );
  return row ? mapSqliteUserRow(row) : null;
}

async function readSqliteUserById(userId) {
  await migrateSqliteCollectionsIfNeeded();
  const db = await getSqliteDb();
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) return null;
  const row = readFirstSqliteRow(
    db.exec(
      `
        SELECT users.id, users.name, users.email, users.password, users.status, users.role, users.permission_profile_id, users.team, users.department_id,
               departments.name AS department_name, users.avatar, users.additional_permissions, users.restricted_permissions, users.permissions, users.created_at, users.updated_at
        FROM users
        LEFT JOIN departments ON departments.id = users.department_id
        WHERE users.id = ?
        LIMIT 1
      `,
      [normalizedUserId],
    ),
  );
  return row ? mapSqliteUserRow(row) : null;
}

async function writeSqliteCollections(collections) {
  const db = await getSqliteDb();
  try {
    db.run("BEGIN");
    db.run("DELETE FROM users");
    db.run("DELETE FROM locations");
    db.run("DELETE FROM departments");

    const insertDepartment = db.prepare(`
      INSERT INTO departments (id, code, name, color, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    collections.departments.forEach((department) => {
      insertDepartment.run([
        department.id,
        department.code,
        department.name,
        department.color || "",
        department.status,
        department.createdAt,
        department.updatedAt,
      ]);
    });
    insertDepartment.free();

    const insertLocation = db.prepare(`
      INSERT INTO locations (id, code, name, department_id, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    collections.locations.forEach((location) => {
      insertLocation.run([
        location.id,
        location.code,
        location.name,
        location.departmentId || null,
        location.status,
        location.createdAt,
        location.updatedAt,
      ]);
    });
    insertLocation.free();

    const insertUser = db.prepare(`
      INSERT INTO users (
        id, name, email, password, status, role, permission_profile_id, team, department_id, avatar,
        additional_permissions, restricted_permissions, permissions, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    collections.users.forEach((user) => {
      insertUser.run([
        user.id,
        user.name,
        user.email,
        user.password,
        user.status || "Ativo",
        user.role,
        user.permissionProfileId || "",
        user.team,
        user.departmentId || null,
        user.avatar || "",
        JSON.stringify(user.additionalPermissions || {}),
        JSON.stringify(user.restrictedPermissions || {}),
        JSON.stringify(user.permissions || {}),
        user.createdAt,
        user.updatedAt,
      ]);
    });
    insertUser.free();

    db.run("COMMIT");
    await persistSqliteDb(db);
  } catch (error) {
    db.run("ROLLBACK");
    throw error;
  }
}

async function writeSqliteState(nextState) {
  const db = await getSqliteDb();
  const existingCollections = await readSqliteCollections();
  const normalizedState = buildCombinedState(stripNormalizedCollections(nextState), {
    users: nextState.users || [],
    departments: nextState.departments || [],
    locations: nextState.locations || [],
  });
  const protectedCollections = protectProductionCollections(
    {
      users: normalizedState.users || [],
      departments: normalizedState.departments || [],
      locations: normalizedState.locations || [],
    },
    existingCollections,
  );
  const protectedState = buildCombinedState(stripNormalizedCollections(normalizedState), protectedCollections);
  const now = new Date().toISOString();

  await writeSqliteCollections({
    departments: protectedState.departments || [],
    locations: protectedState.locations || [],
    users: protectedState.users || [],
  });
  await writeSqliteDomainCollections(protectedState);
  await writeSqliteSingletons(protectedState);

  db.run("DELETE FROM app_state WHERE id = 1");
  db.run("INSERT INTO app_state (id, data, updated_at) VALUES (?, ?, ?)", [
    1,
    JSON.stringify(buildLegacyAppStatePayload(protectedState)),
    now,
  ]);
  db.run("INSERT INTO app_state_history (data, created_at) VALUES (?, ?)", [JSON.stringify(protectedState), now]);
  await persistSqliteDb(db);
  return protectedState;
}

function getPgPool() {
  if (!pgPool) {
    pgPool = new Pool({
      connectionString: databaseUrl,
      ssl: databaseUrl.includes("render.com") ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      keepAlive: true,
    });
    pgPool.on("error", (error) => {
      console.error("postgres pool error", error);
    });
  }
  return pgPool;
}

function attachPgClientErrorHandler(client) {
  const handleError = (error) => {
    console.error("postgres client error", error);
  };
  client.on("error", handleError);
  return () => {
    client.off("error", handleError);
  };
}

async function rollbackPgTransaction(client) {
  try {
    await client.query("ROLLBACK");
  } catch (rollbackError) {
    console.error("postgres rollback skipped", rollbackError);
  }
}

async function withPgClient(callback) {
  const pool = getPgPool();
  const client = await pool.connect();
  const detachErrorHandler = attachPgClientErrorHandler(client);
  try {
    return await callback(client);
  } finally {
    detachErrorHandler();
    client.release();
  }
}

async function ensurePgSchema() {
  if (!pgSchemaPromise) {
    pgSchemaPromise = (async () => {
      const pool = getPgPool();
      await pool.query(`
        CREATE TABLE IF NOT EXISTS app_state (
          id INTEGER PRIMARY KEY,
          data JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL
        );
        CREATE TABLE IF NOT EXISTS app_state_history (
          id BIGSERIAL PRIMARY KEY,
          data JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS app_singletons (
          domain_key TEXT PRIMARY KEY,
          payload JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS departments (
          id TEXT PRIMARY KEY,
          code TEXT NOT NULL,
          name TEXT NOT NULL,
          color TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL
        );
        CREATE TABLE IF NOT EXISTS locations (
          id TEXT PRIMARY KEY,
          code TEXT NOT NULL,
          name TEXT NOT NULL,
          department_id TEXT REFERENCES departments(id),
          status TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL
        );
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          password TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'Ativo',
          role TEXT NOT NULL,
          permission_profile_id TEXT NOT NULL DEFAULT '',
          team TEXT NOT NULL,
          department_id TEXT REFERENCES departments(id),
          avatar TEXT NOT NULL DEFAULT '',
          additional_permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
          restricted_permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
          permissions JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL
        );
        CREATE TABLE IF NOT EXISTS tickets_domain (
          id TEXT PRIMARY KEY,
          payload JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS assets_domain (
          id TEXT PRIMARY KEY,
          payload JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS brands_domain (
          id TEXT PRIMARY KEY,
          payload JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS models_domain (
          id TEXT PRIMARY KEY,
          payload JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS projects_domain (
          id TEXT PRIMARY KEY,
          payload JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS knowledge_articles_domain (
          id TEXT PRIMARY KEY,
          payload JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS api_configs_domain (
          id TEXT PRIMARY KEY,
          payload JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS email_layouts_domain (
          id TEXT PRIMARY KEY,
          payload JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS notification_rules_domain (
          id TEXT PRIMARY KEY,
          payload JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS notification_logs_domain (
          id TEXT PRIMARY KEY,
          payload JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS reports_domain (
          id TEXT PRIMARY KEY,
          payload JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS system_logs (
          id TEXT PRIMARY KEY,
          occurred_at TIMESTAMPTZ NOT NULL,
          user_id TEXT,
          user_name TEXT NOT NULL,
          user_department TEXT NOT NULL,
          module TEXT NOT NULL,
          event_type TEXT NOT NULL,
          description TEXT NOT NULL,
          origin TEXT NOT NULL,
          status TEXT NOT NULL,
          metadata JSONB NOT NULL
        )
      `);
      await pool.query(`
        ALTER TABLE departments ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Ativo';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS permission_profile_id TEXT NOT NULL DEFAULT '';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS additional_permissions JSONB NOT NULL DEFAULT '{}'::jsonb;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS restricted_permissions JSONB NOT NULL DEFAULT '{}'::jsonb;
      `);
    })().catch((error) => {
      pgSchemaPromise = null;
      throw error;
    });
  }

  await pgSchemaPromise;
}

async function readPostgresStateRaw() {
  await ensurePgSchema();
  const pool = getPgPool();
  const { rows } = await pool.query("SELECT data FROM app_state WHERE id = 1");
  return rows[0]?.data || null;
}

async function readSqliteStateBackupRaw() {
  const db = await getSqliteDb();
  const result = db.exec("SELECT data FROM app_state_history ORDER BY created_at DESC, id DESC LIMIT 1");
  const rawData = result?.[0]?.values?.[0]?.[0];
  return parseJson(rawData, null);
}

async function readPostgresStateBackupRaw() {
  await ensurePgSchema();
  const pool = getPgPool();
  const { rows } = await pool.query("SELECT data FROM app_state_history ORDER BY created_at DESC, id DESC LIMIT 1");
  return rows[0]?.data || null;
}

async function readPostgresCollections() {
  await ensurePgSchema();
  const pool = getPgPool();
  const departmentsResult = await pool.query("SELECT id, code, name, color, status, created_at, updated_at FROM departments ORDER BY name");
  const locationsResult = await pool.query(`
    SELECT locations.id, locations.code, locations.name, locations.department_id, departments.name AS department_name,
           locations.status, locations.created_at, locations.updated_at
    FROM locations
    LEFT JOIN departments ON departments.id = locations.department_id
    ORDER BY locations.name
  `);
  const usersResult = await pool.query(`
    SELECT users.id, users.name, users.email, users.password, users.status, users.role, users.permission_profile_id, users.team, users.department_id,
           departments.name AS department_name, users.avatar, users.additional_permissions, users.restricted_permissions, users.permissions, users.created_at, users.updated_at
    FROM users
    LEFT JOIN departments ON departments.id = users.department_id
    ORDER BY users.name
  `);

  return {
    departments: departmentsResult.rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      color: row.color || "",
      status: row.status,
      createdAt: row.created_at?.toISOString?.() || row.created_at,
      updatedAt: row.updated_at?.toISOString?.() || row.updated_at,
    })),
    locations: locationsResult.rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      departmentId: row.department_id || "",
      department: row.department_name || "",
      status: row.status,
      createdAt: row.created_at?.toISOString?.() || row.created_at,
      updatedAt: row.updated_at?.toISOString?.() || row.updated_at,
    })),
    users: usersResult.rows.map((row) => mapPostgresUserRow(row)),
  };
}

async function readPostgresUserByEmail(email) {
  await migratePostgresCollectionsIfNeeded();
  await ensurePgSchema();
  const pool = getPgPool();
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return null;
  const { rows } = await pool.query(
    `
      SELECT users.id, users.name, users.email, users.password, users.status, users.role, users.permission_profile_id, users.team, users.department_id,
             departments.name AS department_name, users.avatar, users.additional_permissions, users.restricted_permissions, users.permissions, users.created_at, users.updated_at
      FROM users
      LEFT JOIN departments ON departments.id = users.department_id
      WHERE LOWER(users.email) = LOWER($1)
      LIMIT 1
    `,
    [normalizedEmail],
  );
  return rows[0] ? mapPostgresUserRow(rows[0]) : null;
}

async function readPostgresUserById(userId) {
  await migratePostgresCollectionsIfNeeded();
  await ensurePgSchema();
  const pool = getPgPool();
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) return null;
  const { rows } = await pool.query(
    `
      SELECT users.id, users.name, users.email, users.password, users.status, users.role, users.permission_profile_id, users.team, users.department_id,
             departments.name AS department_name, users.avatar, users.additional_permissions, users.restricted_permissions, users.permissions, users.created_at, users.updated_at
      FROM users
      LEFT JOIN departments ON departments.id = users.department_id
      WHERE users.id = $1
      LIMIT 1
    `,
    [normalizedUserId],
  );
  return rows[0] ? mapPostgresUserRow(rows[0]) : null;
}

async function countPostgresRows(tableName) {
  await ensurePgSchema();
  const pool = getPgPool();
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS total FROM ${tableName}`);
  return Number(rows[0]?.total || 0);
}

async function readPostgresDomainCollections() {
  await ensurePgSchema();
  const pool = getPgPool();
  const domainCollections = {};

  for (const [key, tableName] of Object.entries(DOMAIN_TABLES)) {
    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM ${tableName}`);
    if (!hasDomainRowsInPostgres(countResult.rows)) {
      domainCollections[key] = null;
      continue;
    }
    const { rows } = await pool.query(`SELECT payload FROM ${tableName} ORDER BY updated_at DESC, id ASC`);
    domainCollections[key] = rows.map((row) => row.payload).filter(Boolean);
  }

  return domainCollections;
}

async function readPostgresSingletons() {
  await ensurePgSchema();
  const pool = getPgPool();
  const { rows } = await pool.query(`SELECT domain_key, payload FROM ${DOMAIN_SINGLETON_TABLE}`);
  return rows.reduce(
    (accumulator, row) => ({
      ...accumulator,
      [row.domain_key]: row.payload,
    }),
    {},
  );
}

async function writePostgresDomainCollections(client, state = {}) {
  for (const [key, tableName] of Object.entries(DOMAIN_TABLES)) {
    await client.query(`TRUNCATE TABLE ${tableName}`);
    const items = Array.isArray(state?.[key]) ? state[key] : [];
    for (const [index, item] of items.entries()) {
      await client.query(
        `INSERT INTO ${tableName} (id, payload, updated_at) VALUES ($1, $2::jsonb, $3)`,
        [normalizeDomainItemId(key, item, index), JSON.stringify(item), getDomainUpdatedAt(item)],
      );
    }
  }
}

async function writePostgresSingletons(client, state = {}) {
  await client.query(`TRUNCATE TABLE ${DOMAIN_SINGLETON_TABLE}`);
  for (const key of DOMAIN_SINGLETON_KEYS) {
    const value = state?.[key];
    if (value === undefined) continue;
    await client.query(
      `INSERT INTO ${DOMAIN_SINGLETON_TABLE} (domain_key, payload, updated_at) VALUES ($1, $2::jsonb, NOW())`,
      [key, JSON.stringify(value)],
    );
  }
}

async function writePostgresCollections(collections) {
  await ensurePgSchema();
  await withPgClient(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query("TRUNCATE TABLE users, locations, departments CASCADE");

      for (const department of collections.departments) {
        await client.query(
          `
            INSERT INTO departments (id, code, name, color, status, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
          `,
          [department.id, department.code, department.name, department.color || "", department.status, department.createdAt, department.updatedAt],
        );
      }

      for (const location of collections.locations) {
        await client.query(
          `
            INSERT INTO locations (id, code, name, department_id, status, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
          `,
          [location.id, location.code, location.name, location.departmentId || null, location.status, location.createdAt, location.updatedAt],
        );
      }

      for (const user of collections.users) {
        await client.query(
          `
            INSERT INTO users (
              id, name, email, password, status, role, permission_profile_id, team, department_id, avatar,
              additional_permissions, restricted_permissions, permissions, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13::jsonb, $14, $15)
          `,
          [
            user.id,
            user.name,
            user.email,
            user.password,
            user.status || "Ativo",
            user.role,
            user.permissionProfileId || "",
            user.team,
            user.departmentId || null,
            user.avatar || "",
            JSON.stringify(user.additionalPermissions || {}),
            JSON.stringify(user.restrictedPermissions || {}),
            JSON.stringify(user.permissions || {}),
            user.createdAt,
            user.updatedAt,
          ],
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await rollbackPgTransaction(client);
      throw error;
    }
  });
}

async function writePostgresState(nextState) {
  await ensurePgSchema();
  const pool = getPgPool();
  const existingCollections = await readPostgresCollections();
  const normalizedState = buildCombinedState(stripNormalizedCollections(nextState), {
    users: nextState.users || [],
    departments: nextState.departments || [],
    locations: nextState.locations || [],
  });
  const protectedCollections = protectProductionCollections(
    {
      users: normalizedState.users || [],
      departments: normalizedState.departments || [],
      locations: normalizedState.locations || [],
    },
    existingCollections,
  );
  const protectedState = buildCombinedState(stripNormalizedCollections(normalizedState), protectedCollections);

  await writePostgresCollections({
    departments: protectedState.departments || [],
    locations: protectedState.locations || [],
    users: protectedState.users || [],
  });
  await withPgClient(async (client) => {
    await client.query("BEGIN");
    try {
      await writePostgresDomainCollections(client, protectedState);
      await writePostgresSingletons(client, protectedState);
      await client.query("COMMIT");
    } catch (error) {
      await rollbackPgTransaction(client);
      throw error;
    }
  });

  await pool.query(
    `
      INSERT INTO app_state (id, data, updated_at)
      VALUES (1, $1::jsonb, NOW())
      ON CONFLICT (id) DO UPDATE SET
        data = EXCLUDED.data,
        updated_at = EXCLUDED.updated_at
    `,
    [JSON.stringify(buildLegacyAppStatePayload(protectedState))],
  );
  await pool.query("INSERT INTO app_state_history (data, created_at) VALUES ($1::jsonb, NOW())", [JSON.stringify(protectedState)]);

  return protectedState;
}

async function migrateSqliteCollectionsIfNeeded() {
  const [usersCount, departmentsCount, locationsCount] = await Promise.all([
    countSqliteRows("users"),
    countSqliteRows("departments"),
    countSqliteRows("locations"),
  ]);
  if (usersCount || departmentsCount || locationsCount) return;

  const legacyState = await readSqliteStateRaw();
  const collections = resolveBootstrapCollections(legacyState);

  if (collections.users.length || collections.departments.length || collections.locations.length) {
    await writeSqliteCollections(collections);
  }
}

async function migratePostgresCollectionsIfNeeded() {
  await ensurePgSchema();
  const usersCount = await countPostgresRows("users");
  const departmentsCount = await countPostgresRows("departments");
  const locationsCount = await countPostgresRows("locations");
  if (usersCount || departmentsCount || locationsCount) return;

  const legacyState = await readPostgresStateRaw();
  const collections = resolveBootstrapCollections(legacyState);

  if (collections.users.length || collections.departments.length || collections.locations.length) {
    await writePostgresCollections(collections);
  }
}

async function loadBootstrapState() {
  const sqliteState = await readSqliteStateRaw();
  if (sqliteState) return sqliteState;
  return buildStateDefaults(bootstrapSeedState);
}

async function restoreSqliteCollectionsFromRecoveryState(currentCollections = {}, primaryState = null) {
  const backupState = await readSqliteStateBackupRaw();
  const recoveredCollections = resolveRecoveryCollections(backupState, primaryState);
  const mergedCollections = mergeMissingCollections(currentCollections, recoveredCollections);
  if (JSON.stringify(mergedCollections) !== JSON.stringify(currentCollections) && hasCollectionRecords(mergedCollections)) {
    await writeSqliteCollections(mergedCollections);
    return mergedCollections;
  }
  return currentCollections;
}

async function restorePostgresCollectionsFromRecoveryState(currentCollections = {}, primaryState = null) {
  const backupState = await readPostgresStateBackupRaw();
  const recoveredCollections = resolveRecoveryCollections(backupState, primaryState);
  const mergedCollections = mergeMissingCollections(currentCollections, recoveredCollections);
  if (JSON.stringify(mergedCollections) !== JSON.stringify(currentCollections) && hasCollectionRecords(mergedCollections)) {
    await writePostgresCollections(mergedCollections);
    return mergedCollections;
  }
  return currentCollections;
}

async function insertSqliteSystemLog(entry) {
  const db = await getSqliteDb();
  db.run(
    `
      INSERT INTO system_logs (
        id, occurred_at, user_id, user_name, user_department, module, event_type, description, origin, status, metadata
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      entry.id,
      entry.occurredAt,
      entry.userId || null,
      entry.userName,
      entry.userDepartment,
      entry.module,
      entry.eventType,
      entry.description,
      entry.origin,
      entry.status,
      JSON.stringify(entry.metadata || {}),
    ],
  );
  await persistSqliteDb(db);
}

async function querySqliteSystemLogs(filters = {}) {
  const db = await getSqliteDb();
  const conditions = [];
  const params = [];

  const addEqualsFilter = (column, value) => {
    if (!String(value || "").trim()) return;
    conditions.push(`LOWER(${column}) = LOWER(?)`);
    params.push(String(value).trim());
  };

  if (filters.startDate) {
    conditions.push("occurred_at >= ?");
    params.push(String(filters.startDate));
  }
  if (filters.endDate) {
    conditions.push("occurred_at <= ?");
    params.push(String(filters.endDate));
  }

  addEqualsFilter("user_name", filters.user);
  addEqualsFilter("user_department", filters.department);
  addEqualsFilter("module", filters.module);
  addEqualsFilter("event_type", filters.eventType);
  addEqualsFilter("status", filters.status);

  const search = String(filters.search || "").trim().toLowerCase();
  if (search) {
    conditions.push("(LOWER(description) LIKE ? OR LOWER(user_name) LIKE ? OR LOWER(module) LIKE ? OR LOWER(event_type) LIKE ?)");
    const likeValue = `%${search}%`;
    params.push(likeValue, likeValue, likeValue, likeValue);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const countResult = db.exec(`SELECT COUNT(*) AS total FROM system_logs ${whereClause}`, params);
  const total = Number(countResult?.[0]?.values?.[0]?.[0] || 0);
  const limit = Math.max(1, Math.min(Number(filters.limit) || 25, 100));
  const page = Math.max(1, Number(filters.page) || 1);
  const offset = (page - 1) * limit;
  const rowsResult = db.exec(
    `
      SELECT id, occurred_at, user_id, user_name, user_department, module, event_type, description, origin, status, metadata
      FROM system_logs
      ${whereClause}
      ORDER BY occurred_at DESC
      LIMIT ? OFFSET ?
    `,
    [...params, limit, offset],
  );
  const table = rowsResult[0];
  const rows =
    table?.values?.map((valueRow) =>
      table.columns.reduce((accumulator, column, index) => ({ ...accumulator, [column]: valueRow[index] }), {}),
    ) || [];

  return {
    items: rows.map(mapSystemLogRow),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

async function insertPostgresSystemLog(entry) {
  await ensurePgSchema();
  const pool = getPgPool();
  await pool.query(
    `
      INSERT INTO system_logs (
        id, occurred_at, user_id, user_name, user_department, module, event_type, description, origin, status, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
    `,
    [
      entry.id,
      entry.occurredAt,
      entry.userId || null,
      entry.userName,
      entry.userDepartment,
      entry.module,
      entry.eventType,
      entry.description,
      entry.origin,
      entry.status,
      JSON.stringify(entry.metadata || {}),
    ],
  );
}

async function queryPostgresSystemLogs(filters = {}) {
  await ensurePgSchema();
  const pool = getPgPool();
  const where = [];
  const values = [];

  const pushValue = (value) => {
    values.push(value);
    return `$${values.length}`;
  };

  const addEqualsFilter = (column, value) => {
    if (!String(value || "").trim()) return;
    where.push(`LOWER(${column}) = LOWER(${pushValue(String(value).trim())})`);
  };

  if (filters.startDate) {
    where.push(`occurred_at >= ${pushValue(String(filters.startDate))}`);
  }
  if (filters.endDate) {
    where.push(`occurred_at <= ${pushValue(String(filters.endDate))}`);
  }

  addEqualsFilter("user_name", filters.user);
  addEqualsFilter("user_department", filters.department);
  addEqualsFilter("module", filters.module);
  addEqualsFilter("event_type", filters.eventType);
  addEqualsFilter("status", filters.status);

  const search = String(filters.search || "").trim().toLowerCase();
  if (search) {
    const placeholder = pushValue(`%${search}%`);
    where.push(`(LOWER(description) LIKE ${placeholder} OR LOWER(user_name) LIKE ${placeholder} OR LOWER(module) LIKE ${placeholder} OR LOWER(event_type) LIKE ${placeholder})`);
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const limit = Math.max(1, Math.min(Number(filters.limit) || 25, 100));
  const page = Math.max(1, Number(filters.page) || 1);
  const offset = (page - 1) * limit;
  const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM system_logs ${whereClause}`, values);
  const rowsResult = await pool.query(
    `
      SELECT id, occurred_at, user_id, user_name, user_department, module, event_type, description, origin, status, metadata
      FROM system_logs
      ${whereClause}
      ORDER BY occurred_at DESC
      LIMIT ${pushValue(limit)} OFFSET ${pushValue(offset)}
    `,
    values,
  );

  return {
    items: rowsResult.rows.map(mapSystemLogRow),
    pagination: {
      page,
      limit,
      total: Number(countResult.rows[0]?.total || 0),
      totalPages: Math.max(1, Math.ceil(Number(countResult.rows[0]?.total || 0) / limit)),
    },
  };
}

export async function readState() {
  if (!isPostgresEnabled()) {
    await migrateSqliteCollectionsIfNeeded();
    const [sqliteState, collections, domainCollections, singletonState] = await Promise.all([
      readSqliteStateRaw(),
      readSqliteCollections(),
      readSqliteDomainCollections(),
      readSqliteSingletons(),
    ]);
    let hydratedCollections = collections;
    if (isLegacyBootstrapUserCollection(collections)) {
      hydratedCollections = buildSeedBootstrapCollections();
      await writeSqliteCollections(hydratedCollections);
    }
    if (shouldHydrateMissingCollections(hydratedCollections)) {
      hydratedCollections = await restoreSqliteCollectionsFromRecoveryState(hydratedCollections, sqliteState);
    }
    const initialState = buildCombinedState(
      {
        ...(sqliteState || buildStateDefaults({})),
        ...singletonState,
        ...Object.fromEntries(
          Object.entries(domainCollections).filter(([, value]) => Array.isArray(value)),
        ),
      },
      hydratedCollections,
    );
    if (!sqliteState || shouldBackfillDomainStorage(domainCollections, singletonState)) {
      await writeSqliteState(initialState);
    }
    return initialState;
  }

  await migratePostgresCollectionsIfNeeded();
  await ensurePgSchema();
  const [postgresState, collections, domainCollections, singletonState] = await Promise.all([
    readPostgresStateRaw(),
    readPostgresCollections(),
    readPostgresDomainCollections(),
    readPostgresSingletons(),
  ]);
  let hydratedCollections = collections;
  if (isLegacyBootstrapUserCollection(collections)) {
    hydratedCollections = buildSeedBootstrapCollections();
    await writePostgresCollections(hydratedCollections);
  }
  if (shouldHydrateMissingCollections(hydratedCollections)) {
    hydratedCollections = await restorePostgresCollectionsFromRecoveryState(hydratedCollections, postgresState);
  }
  const initialState = buildCombinedState(
    {
      ...(postgresState || (await loadBootstrapState())),
      ...singletonState,
      ...Object.fromEntries(
        Object.entries(domainCollections).filter(([, value]) => Array.isArray(value)),
      ),
    },
    hydratedCollections,
  );
  if (!postgresState || shouldBackfillDomainStorage(domainCollections, singletonState)) {
    await writePostgresState(initialState);
  }
  return initialState;
}

export async function readUserByEmail(email) {
  if (!isPostgresEnabled()) {
    return readSqliteUserByEmail(email);
  }
  return readPostgresUserByEmail(email);
}

export async function readUserById(userId) {
  if (!isPostgresEnabled()) {
    return readSqliteUserById(userId);
  }
  return readPostgresUserById(userId);
}

export async function updateUserPassword(userId, passwordHash) {
  const normalizedUserId = String(userId || "").trim();
  const normalizedPasswordHash = String(passwordHash || "").trim();
  if (!normalizedUserId || !normalizedPasswordHash) return null;

  const state = await readState();
  const nextState = {
    ...state,
    users: (state.users || []).map((candidate) =>
      candidate.id === normalizedUserId
        ? {
            ...candidate,
            password: normalizedPasswordHash,
            updatedAt: new Date().toISOString(),
          }
        : candidate,
    ),
  };

  return writeState(nextState);
}

export async function writeState(nextState) {
  if (!isPostgresEnabled()) {
    return writeSqliteState(nextState);
  }
  return writePostgresState(nextState);
}

export async function insertSystemLog(entry) {
  if (!entry?.id) return null;
  if (!isPostgresEnabled()) {
    await insertSqliteSystemLog(entry);
    return entry;
  }
  await insertPostgresSystemLog(entry);
  return entry;
}

export async function querySystemLogs(filters = {}) {
  if (!isPostgresEnabled()) {
    return querySqliteSystemLogs(filters);
  }
  return queryPostgresSystemLogs(filters);
}

export function sanitizeSessionUser(user) {
  if (!user) return null;
  const { password, ...safeUser } = user;
  return safeUser;
}
