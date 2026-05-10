import "server-only";
import { env } from "@/lib/env";
import { captureException } from "@/lib/observability";

/**
 * Email transport. Uses Resend's REST API directly (no SDK dep) so we don't
 * pull a transitive surface for one POST. No-ops in dev/test when
 * RESEND_API_KEY is unset, returning `{ skipped: true }` so call sites can
 * log without branching.
 *
 * Failures NEVER throw to the caller — email is a side effect, not a
 * business-critical path. We capture to Sentry and return an error result.
 */

export interface SendEmailInput {
  to: string | readonly string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  /** Idempotency hint surfaced to Resend (and our logs). */
  tag?: string;
}

export type SendEmailResult =
  | { ok: true; id: string | null; skipped: false }
  | { ok: true; id: null; skipped: true; reason: "no_api_key" }
  | { ok: false; error: string };

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    // Dev-mode visibility: print a redacted line so the signal isn't lost.
    if (process.env.NODE_ENV !== "production") {
      console.info(
        `[email:skipped] no RESEND_API_KEY \u2014 would send "${input.subject}" to ${
          Array.isArray(input.to) ? input.to.join(",") : input.to
        }${input.tag ? ` [${input.tag}]` : ""}`,
      );
    }
    return { ok: true, id: null, skipped: true, reason: "no_api_key" };
  }

  const body = {
    from: env.RESEND_FROM_EMAIL,
    to: Array.isArray(input.to) ? input.to : [input.to],
    subject: input.subject,
    html: input.html,
    text: input.text,
    ...(input.replyTo ? { reply_to: input.replyTo } : {}),
    ...(input.tag ? { tags: [{ name: "category", value: input.tag }] } : {}),
  };

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      // 8s ceiling so a flaky Resend can't hold a server action hostage.
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "<unreadable>");
      const error = `resend_${res.status}: ${detail.slice(0, 200)}`;
      captureException(new Error(error), {
        scope: "email.send",
        extra: { tag: input.tag, subject: input.subject },
      });
      return { ok: false, error };
    }
    const json = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: json.id ?? null, skipped: false };
  } catch (err) {
    captureException(err, {
      scope: "email.send",
      extra: { tag: input.tag, subject: input.subject },
    });
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}
