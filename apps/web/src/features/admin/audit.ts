import "server-only";
import { headers } from "next/headers";
import { db } from "@/db/client";
import { auditLog, type Profile } from "@/db/schema";

/**
 * Append-only audit recorder. Called from inside admin services after any
 * privileged mutation. Failures here MUST NOT swallow the underlying error
 * — the service decides whether to fail or log-and-continue.
 *
 * Snapshots actor email + IP + UA so the row stays meaningful even if the
 * actor is later deleted/renamed.
 */
export interface RecordAuditArgs {
  actor: Pick<Profile, "id" | "email">;
  action: string;
  targetType: string;
  targetId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

export async function recordAudit(args: RecordAuditArgs): Promise<void> {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    null;
  const userAgent = h.get("user-agent") ?? null;

  await db.insert(auditLog).values({
    actorId: args.actor.id,
    actorEmail: args.actor.email,
    action: args.action,
    targetType: args.targetType,
    targetId: args.targetId ?? null,
    before: args.before === undefined ? null : (args.before as object | null),
    after: args.after === undefined ? null : (args.after as object | null),
    reason: args.reason ?? null,
    ip,
    userAgent,
  });
}
