/**
 * Promote a profile to a given role.
 *
 *   pnpm promote-role <email> [role]
 *
 * Defaults to role = "venue_owner". Allowed roles: player, venue_owner, admin.
 *
 * Standalone script — uses DATABASE_URL from .env.local with a direct postgres
 * connection. Does NOT go through the Next "server-only" db client.
 */
import { config as loadEnv } from "dotenv";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, "..", ".env.local") });

const ALLOWED_ROLES = ["player", "venue_owner", "admin"] as const;
type Role = (typeof ALLOWED_ROLES)[number];

function isRole(s: string): s is Role {
  return (ALLOWED_ROLES as readonly string[]).includes(s);
}

// Minimal local table mapping — avoids importing @/db/schema (transitively
// pulls in "server-only" which throws outside Next's runtime).
const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull(),
  role: text("role").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

async function main(): Promise<void> {
  const [, , emailArg, roleArg = "venue_owner"] = process.argv;

  if (!emailArg) {
    console.error("Usage: pnpm promote-role <email> [role]");
    console.error(`  role one of: ${ALLOWED_ROLES.join(", ")} (default: venue_owner)`);
    process.exit(1);
  }
  if (!isRole(roleArg)) {
    console.error(`Invalid role "${roleArg}". Allowed: ${ALLOWED_ROLES.join(", ")}`);
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL not set. Check apps/web/.env.local");
    process.exit(1);
  }

  const email = emailArg.trim().toLowerCase();
  const role: Role = roleArg;

  const client = postgres(databaseUrl, { prepare: false, max: 1 });
  const db = drizzle(client);

  try {
    const updated = await db
      .update(profiles)
      .set({ role, updatedAt: new Date() })
      .where(eq(profiles.email, email))
      .returning({ id: profiles.id, email: profiles.email, role: profiles.role });

    if (updated.length === 0) {
      console.error(`No profile found for email "${email}".`);
      console.error("If the user just signed up, they must confirm their email first.");
      process.exit(2);
    }
    for (const row of updated) {
      console.log(`✓ ${row.email} → role=${row.role} (id=${row.id})`);
    }
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("[promote-role] failed:", err);
  process.exit(1);
});
