import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

let dbPromise = null;

async function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
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

  return dbPromise;
}

async function persistDb(db) {
  const bytes = db.export();
  fs.writeFileSync(dbPath, Buffer.from(bytes));
}

export async function readState() {
  const db = await getDb();
  const result = db.exec("SELECT data FROM app_state WHERE id = 1");

  if (!result.length || !result[0].values.length) {
    const initialState = withDefaults({});
    await writeState(initialState);
    return initialState;
  }

  try {
    return withDefaults(JSON.parse(String(result[0].values[0][0] || "{}")));
  } catch {
    const initialState = withDefaults({});
    await writeState(initialState);
    return initialState;
  }
}

export async function writeState(nextState) {
  const db = await getDb();
  const normalizedState = withDefaults(nextState);
  const now = new Date().toISOString();

  db.run("DELETE FROM app_state WHERE id = 1");
  db.run("INSERT INTO app_state (id, data, updated_at) VALUES (?, ?, ?)", [
    1,
    JSON.stringify(normalizedState),
    now,
  ]);
  await persistDb(db);
  return normalizedState;
}

export function sanitizeSessionUser(user) {
  if (!user) return null;
  const { password, ...safeUser } = user;
  return safeUser;
}
