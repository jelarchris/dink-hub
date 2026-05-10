/**
 * Apply a SQL migration file to DATABASE_URL.
 *
 *   pnpm migrate-run src/db/migrations/0003_admin.sql
 *
 * Standalone — does not import @/db/client (server-only).
 */
import { config as loadEnv } from "dotenv";
import postgres from "postgres";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, "..", ".env.local") });

async function main(): Promise<void> {
  const [, , fileArg] = process.argv;
  if (!fileArg) {
    console.error("Usage: pnpm migrate-run <path-to-sql-file>");
    process.exit(1);
  }

  const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL (or DIRECT_URL) not set in .env.local");
    process.exit(1);
  }

  const filePath = path.isAbsolute(fileArg) ? fileArg : path.resolve(process.cwd(), fileArg);
  const sql = await fs.readFile(filePath, "utf8");
  console.log(`→ applying ${filePath}`);

  // simple = true: required for `ALTER TYPE ... ADD VALUE` which can't run
  // inside a transaction. The whole file is sent as one query batch.
  const client = postgres(databaseUrl, { prepare: false, max: 1, onnotice: () => {} });
  try {
    await client.unsafe(sql);
    console.log("✓ migration applied");
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("[migrate-run] failed:", err);
  process.exit(1);
});
