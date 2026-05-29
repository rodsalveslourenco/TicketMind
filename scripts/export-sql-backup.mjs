import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";

const databaseUrl = String(process.env.DATABASE_URL || "").trim();
const backupPath = String(process.env.BACKUP_PATH || "").trim();

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

if (!backupPath) {
  throw new Error("BACKUP_PATH is required.");
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

function quoteIdent(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function quoteLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  if (value instanceof Date) return quoteLiteral(value.toISOString());
  if (typeof value === "object") return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function listTables() {
  const { rows } = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  return rows.map((row) => row.table_name);
}

async function exportTable(tableName) {
  const { rows } = await pool.query(`SELECT * FROM ${quoteIdent(tableName)}`);
  if (!rows.length) return [`-- ${tableName}: 0 rows`];

  const columns = Object.keys(rows[0]);
  const columnSql = columns.map(quoteIdent).join(", ");
  const lines = [`-- ${tableName}: ${rows.length} rows`];
  for (const row of rows) {
    const valuesSql = columns.map((column) => quoteLiteral(row[column])).join(", ");
    lines.push(`INSERT INTO ${quoteIdent(tableName)} (${columnSql}) VALUES (${valuesSql}) ON CONFLICT DO NOTHING;`);
  }
  return lines;
}

try {
  const tables = await listTables();
  const lines = [
    "-- TicketMind SQL data backup",
    `-- Created at: ${new Date().toISOString()}`,
    "BEGIN;",
  ];

  for (const table of tables) {
    lines.push("", ...(await exportTable(table)));
  }

  lines.push("", "COMMIT;", "");
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.writeFileSync(backupPath, lines.join("\n"), "utf8");
  console.log(JSON.stringify({ backupPath, tables: tables.length }));
} finally {
  await pool.end();
}
