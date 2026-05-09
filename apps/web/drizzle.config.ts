import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit config for migrations.
 * DATABASE_URL must be set in .env.local (gitignored).
 */
export default defineConfig({
  schema: "./src/db/schema/*",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
  verbose: true,
  strict: true,
});
