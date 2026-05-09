/**
 * Test bootstrap. Loads .env.local so DATABASE_URL is available, and stubs
 * the `server-only` import (Vitest runs in Node, not Next.js).
 *
 * For tests we prefer the DIRECT_URL (port 5432) over the transaction pooler
 * because we write to auth.users (cross-schema) and the pooler can be flaky
 * with prepared-statement-disabled connections on cross-schema DDL/DML.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { vi } from "vitest";

config({ path: resolve(__dirname, "../../.env.local") });
config({ path: resolve(__dirname, "../../.env.test.local"), override: true });

if (process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

vi.mock("server-only", () => ({}));
