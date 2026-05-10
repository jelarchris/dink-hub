import path from "node:path";
import { test as base, request as pwRequest } from "@playwright/test";
import { E2E, E2E_PASSWORD } from "./seed";

/**
 * Auth helpers for E2E specs.
 *
 * Strategy: per-spec sign-in via POST /api/test/signin (gated by E2E_TEST_TOKEN).
 * The route does a normal signInWithPassword for the seeded persona, returning
 * Supabase auth cookies. We persist them to a per-role storageState file so
 * every spec starts pre-authenticated without re-hitting the route.
 *
 * Storage state files are written into ./e2e/.auth/<role>.json (gitignored).
 */

const AUTH_DIR = path.resolve(process.cwd(), "e2e", ".auth");

export type Role = "admin" | "owner" | "player";

export const STORAGE_STATE: Record<Role, string> = {
  admin: path.join(AUTH_DIR, "admin.json"),
  owner: path.join(AUTH_DIR, "owner.json"),
  player: path.join(AUTH_DIR, "player.json"),
};

export const PERSONA: Record<Role, { email: string }> = {
  admin: { email: E2E.admin.email },
  owner: { email: E2E.owner.email },
  player: { email: E2E.player.email },
};

/**
 * Sign a persona in via the test-only route and persist cookies to a
 * storageState JSON file. Idempotent — overwrites on each run.
 */
export async function signInAndPersist(role: Role, baseURL: string): Promise<string> {
  const token = process.env.E2E_TEST_TOKEN;
  if (!token) throw new Error("[e2e auth] E2E_TEST_TOKEN env is required");

  const ctx = await pwRequest.newContext({ baseURL });
  const res = await ctx.post("/api/test/signin", {
    headers: { "x-e2e-token": token },
    data: { email: PERSONA[role].email, password: E2E_PASSWORD },
  });
  if (!res.ok()) {
    const body = await res.text().catch(() => "<unreadable>");
    throw new Error(`[e2e auth] signin failed for ${role}: ${res.status()} ${body}`);
  }

  const file = STORAGE_STATE[role];
  await ctx.storageState({ path: file });
  await ctx.dispose();
  return file;
}

/**
 * Per-role test fixture. Use:
 *   import { test } from "../support/auth";
 *   test.use({ storageState: STORAGE_STATE.player });
 */
export const test = base;
