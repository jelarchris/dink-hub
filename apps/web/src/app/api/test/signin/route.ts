import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * E2E-ONLY signin shortcut.
 *
 * Hard-gated by:
 *   1. NODE_ENV !== "production"  (returns 404 in prod)
 *   2. NEXT_PUBLIC_APP_ENV !== "production"
 *   3. Header "x-e2e-token" matching env.E2E_TEST_TOKEN
 *
 * Performs a normal signInWithPassword on behalf of the seeded test persona,
 * which sets the standard Supabase auth cookies on the response. No service
 * role, no admin API \u2014 just a thin convenience around the public auth path
 * so Playwright can produce a logged-in storageState quickly.
 *
 * If any guard fails the route returns 404 (not 401/403) to avoid leaking
 * the existence of the endpoint in production.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function notFound() {
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}

export async function POST(req: Request): Promise<NextResponse> {
  if (process.env.NODE_ENV === "production") return notFound();
  if (env.NEXT_PUBLIC_APP_ENV === "production") return notFound();

  const expected = env.E2E_TEST_TOKEN;
  if (!expected) return notFound();

  const provided = req.headers.get("x-e2e-token");
  if (!provided || provided !== expected) return notFound();

  const json: unknown = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error || !data.user) {
    return NextResponse.json(
      { error: "invalid_credentials", detail: error?.message ?? "no user" },
      { status: 401 },
    );
  }

  return NextResponse.json({ ok: true, userId: data.user.id });
}
