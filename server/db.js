import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import initSqlJs from "sql.js";
import { seedData } from "../src/data/seedData.js";
import { normalizeUserPermissions } from "../src/data/permissions.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const dataDir = process.env.DB_DIR
  ? path.resolve(process.env.DB_DIR)
  : path.join(rootDir, "data");
const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(dataDir, "ticketmind.sqlite");
const wasmPath = path.join(rootDir, "node_modules", "sql.js", "dist");
const databaseUrl = String(process.env.DATABASE_URL || "").trim();

function buildDefaultUsers() {
  return seedData.users.map((candidate) => ({
    ...candidate,
    password: candidate.password || "admin0123",
    permissions: normalizeUserPermissions(candidate.permissions || {}, candidate),
  }));
}

function mergeCatalogItems(storedItems, seedItems, identityBuilder) {
  const currentItems = Array.isArray(storedItems) ? storedItems : [];
  const identities = new Set(currentItems.map(identityBuilder));
  const missingSeedItems = seedItems.filter((item) => !identities.has(identityBuilder(item)));
  return [...currentItems, ...missingSeedItems];
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function withDefaults(stored = {}) {
  const users =
    Array.isArray(stored.users) && stored.users.length
      ? stored.users.map((candidate) => ({
          ...candidate,
          password: candidate.password || "admin0123",
          permissions: normalizeUserPermissions(candidate.permissions || {}, candidate),
        }))
      : buildDefaultUsers();

  return {
    ...seedData,
    ...stored,
    users,
    queues: Array.isArray(stored.queues) && stored.queues.length ? stored.queues : seedData.queues,
    tickets: Array.isArray(stored.tickets) ? stored.tickets : seedData.tickets,
    assets: Array.isArray(stored.assets) ? stored.assets : seedData.assets,
    brands: mergeCatalogItems(
      stored.brands,
      seedData.brands,
      (brand) => `${normalizeText(brand.assetType)}::${normalizeText(brand.name)}`,
    ),
    models: mergeCatalogItems(
      stored.models,
      seedData.models,
      (model) =>
        `${normalizeText(model.assetType)}::${normalizeText(model.brandName)}::${normalizeText(model.name)}`,
    ),
    projects: Array.isArray(stored.projects) ? stored.projects : seedData.projects,
    apiConfigs: Array.isArray(stored.apiConfigs) ? stored.apiConfigs : seedData.apiConfigs,
    reports: Array.isArray(stored.reports) && stored.reports.length ? stored.reports : seedData.reports,
  };
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
      db.run(`
        CREATE TABLE IF NOT EXISTS app_state (
          id INTEGER PRIMARY KEY,
          data TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
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

async function readSqliteStateRaw() {
  const db = await getSqliteDb();
  const result = db.exec("SELECT data FROM app_state WHERE id = 1");
  if (!result.length || !result[0].values.length) return null;

  try {
    return JSON.parse(String(result[0].values[0][0] || "{}"));
  } catch {
    return null;
  }
}

async function writeSqliteState(nextState) {
  const db = await getSqliteDb();
  const normalizedState = withDefaults(nextState);
  const now = new Date().toISOString();

  db.run("DELETE FROM app_state WHERE id = 1");
  db.run("INSERT INTO app_state (id, data, updated_at) VALUES (?, ?, ?)", [
    1,
    JSON.stringify(normalizedState),
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
    )
  `);
}

async function readPostgresStateRaw() {
  await ensurePgSchema();
  const pool = getPgPool();
  const { rows } = await pool.query("SELECT data FROM app_state WHERE id = 1");
  return rows[0]?.data || null;
}

async function writePostgresState(nextState) {
  await ensurePgSchema();
  const pool = getPgPool();
  const normalizedState = withDefaults(nextState);

  await pool.query(
    `
      INSERT INTO app_state (id, data, updated_at)
      VALUES (1, $1::jsonb, NOW())
      ON CONFLICT (id) DO UPDATE SET
        data = EXCLUDED.data,
        updated_at = EXCLUDED.updated_at
    `,
    [JSON.stringify(normalizedState)],
  );

  return normalizedState;
}

async function loadBootstrapState() {
  const sqliteState = await readSqliteStateRaw();
  if (sqliteState) return sqliteState;
  return {};
}

export async function readState() {
  if (!isPostgresEnabled()) {
    const sqliteState = await readSqliteStateRaw();
    if (sqliteState) return withDefaults(sqliteState);
    const initialState = withDefaults({});
    await writeSqliteState(initialState);
    return initialState;
  }

  const postgresState = await readPostgresStateRaw();
  if (postgresState) return withDefaults(postgresState);

  const initialState = withDefaults(await loadBootstrapState());
  await writePostgresState(initialState);
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
