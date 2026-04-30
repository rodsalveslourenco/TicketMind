import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import initSqlJs from "sql.js";
import { seedData } from "../src/data/seedData.js";
import { normalizeRoleName, normalizeUserPermissions } from "../src/data/permissions.js";
import { normalizeKnowledgeArticle, syncHelpdeskState } from "../src/data/helpdesk.js";
import {
  defaultEmailPlaceholders,
  defaultNavigationSections,
  defaultNotificationEvents,
  defaultPermissionCatalog,
  defaultPermissionProfiles,
  defaultSmtpSettings,
} from "../src/data/systemDefaults.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const dataDir = process.env.DB_DIR ? path.resolve(process.env.DB_DIR) : path.join(rootDir, "data");
const dbPath = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(dataDir, "ticketmind.sqlite");
const wasmPath = path.join(rootDir, "node_modules", "sql.js", "dist");
const databaseUrl = String(process.env.DATABASE_URL || "").trim();
const isProduction = String(process.env.NODE_ENV || "").trim() === "production";

const staticSeedState = {
  ...seedData,
  currentUser: null,
  users: [],
  departments: [],
  locations: [],
};

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

  const normalizedRecord = {
    id: String(record.id || "").trim(),
    name: String(record.name || "").trim(),
    email: String(record.email || "").trim().toLowerCase(),
    password: String(record.password || "").trim(),
    role: normalizeRoleName(record.role),
    team: String(record.team || "").trim(),
    departmentId: matchedDepartment?.id || departmentId,
    department: matchedDepartment?.name || departmentName,
    avatar: String(record.avatar || "").trim(),
    permissions: normalizeUserPermissions(record.permissions || {}, record, permissionCatalog, permissionProfiles),
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
  const currentUser = stored.currentUser && typeof stored.currentUser === "object" ? stored.currentUser : null;

  return {
    ...staticSeedState,
    ...stored,
    currentUser,
    permissionCatalog:
      Array.isArray(stored.permissionCatalog) && stored.permissionCatalog.length
        ? stored.permissionCatalog
        : defaultPermissionCatalog,
    permissionProfiles:
      Array.isArray(stored.permissionProfiles) && stored.permissionProfiles.length
        ? stored.permissionProfiles
        : defaultPermissionProfiles,
    navigationSections:
      Array.isArray(stored.navigationSections) && stored.navigationSections.length
        ? stored.navigationSections
        : defaultNavigationSections,
    notificationEvents:
      Array.isArray(stored.notificationEvents) && stored.notificationEvents.length
        ? stored.notificationEvents
        : defaultNotificationEvents,
    emailPlaceholders:
      Array.isArray(stored.emailPlaceholders) && stored.emailPlaceholders.length
        ? stored.emailPlaceholders
        : defaultEmailPlaceholders,
    emailLayouts: Array.isArray(stored.emailLayouts) ? stored.emailLayouts : [],
    notificationRules: Array.isArray(stored.notificationRules) ? stored.notificationRules : [],
    notificationLogs: Array.isArray(stored.notificationLogs) ? stored.notificationLogs : [],
    smtpSettings:
      stored.smtpSettings && typeof stored.smtpSettings === "object"
        ? { ...defaultSmtpSettings, ...stored.smtpSettings }
        : defaultSmtpSettings,
    users: Array.isArray(stored.users) ? stored.users : [],
    departments: Array.isArray(stored.departments) ? stored.departments : [],
    locations: Array.isArray(stored.locations) ? stored.locations : [],
    queues: Array.isArray(stored.queues) ? stored.queues : staticSeedState.queues,
    tickets: Array.isArray(stored.tickets) ? stored.tickets : staticSeedState.tickets,
    assets: Array.isArray(stored.assets) ? stored.assets : staticSeedState.assets,
    brands: Array.isArray(stored.brands) ? stored.brands : staticSeedState.brands,
    models: Array.isArray(stored.models) ? stored.models : staticSeedState.models,
    projects: Array.isArray(stored.projects) ? stored.projects : staticSeedState.projects,
    knowledgeArticles: (Array.isArray(stored.knowledgeArticles) ? stored.knowledgeArticles : staticSeedState.knowledgeArticles).map(normalizeKnowledgeArticle),
    apiConfigs: Array.isArray(stored.apiConfigs) ? stored.apiConfigs : staticSeedState.apiConfigs,
    reports: Array.isArray(stored.reports) ? stored.reports : staticSeedState.reports,
  };
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
      ? appStateRaw.permissionProfiles
      : defaultPermissionProfiles;
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
  const { users, departments, locations, ...rest } = state || {};
  return {
    ...rest,
    currentUser: state.currentUser || null,
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

function buildDevelopmentBootstrapCollections() {
  const developmentUsers = Array.isArray(seedData.users) ? seedData.users : [];
  const departments = deriveDepartments({ users: developmentUsers });
  const locations = deriveLocations({ assets: seedData.assets, tickets: seedData.tickets }, departments);
  const users = deriveUsers({ users: developmentUsers }, departments);
  return { departments, locations, users };
}

let sqlitePromise = null;
let pgPool = null;

function isPostgresEnabled() {
  return Boolean(databaseUrl);
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
        CREATE TABLE IF NOT EXISTS departments (
          id TEXT PRIMARY KEY,
          code TEXT NOT NULL,
          name TEXT NOT NULL,
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
          role TEXT NOT NULL,
          team TEXT NOT NULL,
          department_id TEXT,
          avatar TEXT NOT NULL DEFAULT '',
          permissions TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (department_id) REFERENCES departments(id)
        );
      `);
      return db;
    })();
  }

  return sqlitePromise;
}

async function persistSqliteDb(db) {
  const bytes = db.export();
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dbPath, Buffer.from(bytes));
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(String(value)) : fallback;
  } catch {
    return fallback;
  }
}

async function readSqliteStateRaw() {
  const db = await getSqliteDb();
  const result = db.exec("SELECT data FROM app_state WHERE id = 1");
  if (!result.length || !result[0].values.length) return null;
  return parseJson(result[0].values[0][0], null);
}

async function readSqliteCollections() {
  const db = await getSqliteDb();
  const departmentsResult = db.exec("SELECT id, code, name, status, created_at, updated_at FROM departments ORDER BY name");
  const locationsResult = db.exec(`
    SELECT locations.id, locations.code, locations.name, locations.department_id, departments.name AS department_name,
           locations.status, locations.created_at, locations.updated_at
    FROM locations
    LEFT JOIN departments ON departments.id = locations.department_id
    ORDER BY locations.name
  `);
  const usersResult = db.exec(`
    SELECT users.id, users.name, users.email, users.password, users.role, users.team, users.department_id,
           departments.name AS department_name, users.avatar, users.permissions, users.created_at, users.updated_at
    FROM users
    LEFT JOIN departments ON departments.id = users.department_id
    ORDER BY users.name
  `);

  const mapRows = (result) => {
    if (!result.length) return [];
    const [table] = result;
    return table.values.map((valueRow) =>
      table.columns.reduce((accumulator, column, index) => ({ ...accumulator, [column]: valueRow[index] }), {}),
    );
  };

  return {
    departments: mapRows(departmentsResult).map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    locations: mapRows(locationsResult).map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      departmentId: row.department_id || "",
      department: row.department_name || "",
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    users: mapRows(usersResult).map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      password: row.password,
      role: row.role,
      team: row.team,
      departmentId: row.department_id || "",
      department: row.department_name || "",
      avatar: row.avatar || "",
      permissions: parseJson(row.permissions, {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  };
}

async function countSqliteRows(tableName) {
  const db = await getSqliteDb();
  const result = db.exec(`SELECT COUNT(*) AS total FROM ${tableName}`);
  return Number(result?.[0]?.values?.[0]?.[0] || 0);
}

async function writeSqliteCollections(collections) {
  const db = await getSqliteDb();
  db.run("BEGIN");
  try {
    db.run("DELETE FROM users");
    db.run("DELETE FROM locations");
    db.run("DELETE FROM departments");

    const insertDepartment = db.prepare(`
      INSERT INTO departments (id, code, name, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    collections.departments.forEach((department) => {
      insertDepartment.run([
        department.id,
        department.code,
        department.name,
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
      INSERT INTO users (id, name, email, password, role, team, department_id, avatar, permissions, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    collections.users.forEach((user) => {
      insertUser.run([
        user.id,
        user.name,
        user.email,
        user.password,
        user.role,
        user.team,
        user.departmentId || null,
        user.avatar || "",
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
  const normalizedState = buildCombinedState(stripNormalizedCollections(nextState), {
    users: nextState.users || [],
    departments: nextState.departments || [],
    locations: nextState.locations || [],
  });
  const now = new Date().toISOString();

  await writeSqliteCollections({
    departments: normalizedState.departments || [],
    locations: normalizedState.locations || [],
    users: normalizedState.users || [],
  });

  db.run("DELETE FROM app_state WHERE id = 1");
  db.run("INSERT INTO app_state (id, data, updated_at) VALUES (?, ?, ?)", [
    1,
    JSON.stringify(stripNormalizedCollections(normalizedState)),
    now,
  ]);
  await persistSqliteDb(db);
  return normalizedState;
}

function getPgPool() {
  if (!pgPool) {
    pgPool = new Pool({
      connectionString: databaseUrl,
      ssl: databaseUrl.includes("render.com") ? { rejectUnauthorized: false } : false,
    });
  }
  return pgPool;
}

async function ensurePgSchema() {
  const pool = getPgPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS departments (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
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
      role TEXT NOT NULL,
      team TEXT NOT NULL,
      department_id TEXT REFERENCES departments(id),
      avatar TEXT NOT NULL DEFAULT '',
      permissions JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    )
  `);
}

async function readPostgresStateRaw() {
  await ensurePgSchema();
  const pool = getPgPool();
  const { rows } = await pool.query("SELECT data FROM app_state WHERE id = 1");
  return rows[0]?.data || null;
}

async function readPostgresCollections() {
  await ensurePgSchema();
  const pool = getPgPool();
  const [departmentsResult, locationsResult, usersResult] = await Promise.all([
    pool.query("SELECT id, code, name, status, created_at, updated_at FROM departments ORDER BY name"),
    pool.query(`
      SELECT locations.id, locations.code, locations.name, locations.department_id, departments.name AS department_name,
             locations.status, locations.created_at, locations.updated_at
      FROM locations
      LEFT JOIN departments ON departments.id = locations.department_id
      ORDER BY locations.name
    `),
    pool.query(`
      SELECT users.id, users.name, users.email, users.password, users.role, users.team, users.department_id,
             departments.name AS department_name, users.avatar, users.permissions, users.created_at, users.updated_at
      FROM users
      LEFT JOIN departments ON departments.id = users.department_id
      ORDER BY users.name
    `),
  ]);

  return {
    departments: departmentsResult.rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
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
    users: usersResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      password: row.password,
      role: row.role,
      team: row.team,
      departmentId: row.department_id || "",
      department: row.department_name || "",
      avatar: row.avatar || "",
      permissions: row.permissions || {},
      createdAt: row.created_at?.toISOString?.() || row.created_at,
      updatedAt: row.updated_at?.toISOString?.() || row.updated_at,
    })),
  };
}

async function countPostgresRows(tableName) {
  await ensurePgSchema();
  const pool = getPgPool();
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS total FROM ${tableName}`);
  return Number(rows[0]?.total || 0);
}

async function writePostgresCollections(collections) {
  await ensurePgSchema();
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM users");
    await client.query("DELETE FROM locations");
    await client.query("DELETE FROM departments");

    for (const department of collections.departments) {
      await client.query(
        `
          INSERT INTO departments (id, code, name, status, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [department.id, department.code, department.name, department.status, department.createdAt, department.updatedAt],
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
          INSERT INTO users (id, name, email, password, role, team, department_id, avatar, permissions, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
        `,
        [
          user.id,
          user.name,
          user.email,
          user.password,
          user.role,
          user.team,
          user.departmentId || null,
          user.avatar || "",
          JSON.stringify(user.permissions || {}),
          user.createdAt,
          user.updatedAt,
        ],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function writePostgresState(nextState) {
  await ensurePgSchema();
  const pool = getPgPool();
  const normalizedState = buildCombinedState(stripNormalizedCollections(nextState), {
    users: nextState.users || [],
    departments: nextState.departments || [],
    locations: nextState.locations || [],
  });

  await writePostgresCollections({
    departments: normalizedState.departments || [],
    locations: normalizedState.locations || [],
    users: normalizedState.users || [],
  });

  await pool.query(
    `
      INSERT INTO app_state (id, data, updated_at)
      VALUES (1, $1::jsonb, NOW())
      ON CONFLICT (id) DO UPDATE SET
        data = EXCLUDED.data,
        updated_at = EXCLUDED.updated_at
    `,
    [JSON.stringify(stripNormalizedCollections(normalizedState))],
  );

  return normalizedState;
}

async function migrateSqliteCollectionsIfNeeded() {
  const [usersCount, departmentsCount, locationsCount] = await Promise.all([
    countSqliteRows("users"),
    countSqliteRows("departments"),
    countSqliteRows("locations"),
  ]);
  if (usersCount || departmentsCount || locationsCount) return;

  const legacyState = await readSqliteStateRaw();
  const collections =
    legacyState && Object.keys(legacyState).length
      ? buildMigrationCollections(legacyState)
      : !isProduction
        ? buildDevelopmentBootstrapCollections()
        : { departments: [], locations: [], users: [] };

  if (collections.users.length || collections.departments.length || collections.locations.length) {
    await writeSqliteCollections(collections);
  }
}

async function migratePostgresCollectionsIfNeeded() {
  const [usersCount, departmentsCount, locationsCount] = await Promise.all([
    countPostgresRows("users"),
    countPostgresRows("departments"),
    countPostgresRows("locations"),
  ]);
  if (usersCount || departmentsCount || locationsCount) return;

  const legacyState = await readPostgresStateRaw();
  const collections =
    legacyState && Object.keys(legacyState).length
      ? buildMigrationCollections(legacyState)
      : !isProduction
        ? buildDevelopmentBootstrapCollections()
        : { departments: [], locations: [], users: [] };

  if (collections.users.length || collections.departments.length || collections.locations.length) {
    await writePostgresCollections(collections);
  }
}

async function loadBootstrapState() {
  const sqliteState = await readSqliteStateRaw();
  if (sqliteState) return sqliteState;
  return buildStateDefaults({});
}

export async function readState() {
  if (!isPostgresEnabled()) {
    await migrateSqliteCollectionsIfNeeded();
    const [sqliteState, collections] = await Promise.all([readSqliteStateRaw(), readSqliteCollections()]);
    const initialState = buildCombinedState(sqliteState || buildStateDefaults({}), collections);
    if (!sqliteState) {
      await writeSqliteState(initialState);
    }
    return initialState;
  }

  await migratePostgresCollectionsIfNeeded();
  const [postgresState, collections] = await Promise.all([readPostgresStateRaw(), readPostgresCollections()]);
  const initialState = buildCombinedState(postgresState || (await loadBootstrapState()), collections);
  if (!postgresState) {
    await writePostgresState(initialState);
  }
  return initialState;
}

export async function writeState(nextState) {
  if (!isPostgresEnabled()) {
    return writeSqliteState(nextState);
  }
  return writePostgresState(nextState);
}

export function sanitizeSessionUser(user) {
  if (!user) return null;
  const { password, ...safeUser } = user;
  return safeUser;
}
