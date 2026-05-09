import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";

/**
 * Drizzle DB client. Server-only.
 * Uses Supabase's transaction pooler (port 6543) for serverless-friendly connections.
 * For long-lived connections (migrations, seeds) use DIRECT_URL (port 5432).
 */

const connectionString = env.DATABASE_URL;

// Reuse connection across HMR in dev to avoid pool exhaustion
const globalForDb = globalThis as unknown as {
  pgClient: ReturnType<typeof postgres> | undefined;
};

const client =
  globalForDb.pgClient ??
  postgres(connectionString, {
    prepare: false, // required for Supabase transaction pooler
    max: 10,
  });

if (env.NODE_ENV !== "production") {
  globalForDb.pgClient = client;
}

export const db = drizzle(client);
export type DB = typeof db;
