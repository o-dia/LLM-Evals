import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { env } from "./env.js";

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const pool = new Pool({
  host: env.db.host,
  port: env.db.port,
  database: env.db.name,
  user: env.db.user,
  password: env.db.password,
  ssl: env.db.ssl ? { rejectUnauthorized: false } : undefined
});

export type MigrationResult = {
  applied: string[];
  skipped: string[];
};

const migrationsDir = path.resolve(__dirname, "../migrations");

const ensureMigrationsTableSql = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

const listMigrationFiles = async (): Promise<string[]> => {
  const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();
};

export const runMigrations = async (): Promise<MigrationResult> => {
  const applied: string[] = [];
  const skipped: string[] = [];

  await pool.query(ensureMigrationsTableSql);

  const result = await pool.query("SELECT id FROM schema_migrations ORDER BY id ASC");
  const alreadyApplied = new Set(result.rows.map((row) => row.id as string));

  const files = await listMigrationFiles();

  for (const file of files) {
    if (alreadyApplied.has(file)) {
      skipped.push(file);
      continue;
    }

    const filePath = path.join(migrationsDir, file);
    const sql = await fs.readFile(filePath, "utf-8");

    await pool.query("BEGIN");
    try {
      await pool.query(sql);
      await pool.query("INSERT INTO schema_migrations (id) VALUES ($1)", [file]);
      await pool.query("COMMIT");
      applied.push(file);
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
  }

  return { applied, skipped };
};
