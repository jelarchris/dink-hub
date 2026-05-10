import { z } from "zod";

/**
 * Centralized env validation. Fail fast at boot if anything is missing or malformed.
 * Server-only secrets MUST NOT be prefixed with NEXT_PUBLIC_.
 * Anything prefixed with NEXT_PUBLIC_ is bundled to the browser — treat as public.
 */

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20, "SUPABASE_SERVICE_ROLE_KEY required"),
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid postgres URL"),
  DIRECT_URL: z.string().url("DIRECT_URL must be a valid postgres URL").optional(),
  RESEND_API_KEY: z.string().optional(),
  SEMAPHORE_API_KEY: z.string().optional(),
  TURNSTILE_SECRET_KEY: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  CRON_SECRET: z.string().min(16, "CRON_SECRET must be at least 16 chars").optional(),
});

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20, "NEXT_PUBLIC_SUPABASE_ANON_KEY required"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_APP_ENV: z.enum(["development", "preview", "production", "ci"]).default("development"),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_HOST: z.string().url().optional(),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
});

/**
 * Build an object containing only NEXT_PUBLIC_ vars at build/runtime.
 * Server vars are accessed via process.env directly during runtime resolution
 * (Next.js inlines NEXT_PUBLIC_ vars at build time).
 *
 * Empty strings are coerced to undefined so optional vars work whether the
 * .env line is missing OR present-but-blank.
 */
const blankToUndefined = (v: string | undefined): string | undefined =>
  v === undefined || v === "" ? undefined : v;

const processEnv = {
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_SUPABASE_URL: blankToUndefined(process.env.NEXT_PUBLIC_SUPABASE_URL),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: blankToUndefined(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  NEXT_PUBLIC_APP_URL: blankToUndefined(process.env.NEXT_PUBLIC_APP_URL),
  NEXT_PUBLIC_APP_ENV: blankToUndefined(process.env.NEXT_PUBLIC_APP_ENV),
  NEXT_PUBLIC_POSTHOG_KEY: blankToUndefined(process.env.NEXT_PUBLIC_POSTHOG_KEY),
  NEXT_PUBLIC_POSTHOG_HOST: blankToUndefined(process.env.NEXT_PUBLIC_POSTHOG_HOST),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: blankToUndefined(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY),
  SUPABASE_SERVICE_ROLE_KEY: blankToUndefined(process.env.SUPABASE_SERVICE_ROLE_KEY),
  DATABASE_URL: blankToUndefined(process.env.DATABASE_URL),
  DIRECT_URL: blankToUndefined(process.env.DIRECT_URL),
  RESEND_API_KEY: blankToUndefined(process.env.RESEND_API_KEY),
  SEMAPHORE_API_KEY: blankToUndefined(process.env.SEMAPHORE_API_KEY),
  TURNSTILE_SECRET_KEY: blankToUndefined(process.env.TURNSTILE_SECRET_KEY),
  UPSTASH_REDIS_REST_URL: blankToUndefined(process.env.UPSTASH_REDIS_REST_URL),
  UPSTASH_REDIS_REST_TOKEN: blankToUndefined(process.env.UPSTASH_REDIS_REST_TOKEN),
  SENTRY_DSN: blankToUndefined(process.env.SENTRY_DSN),
  CRON_SECRET: blankToUndefined(process.env.CRON_SECRET),
};

const isServer = typeof window === "undefined";

const merged = serverSchema.merge(clientSchema);
const parsed = isServer
  ? merged.safeParse(processEnv)
  : clientSchema.safeParse(processEnv);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment variables — see logs above.");
}

/**
 * Proxy that throws if a server-only var is accessed from the browser.
 * Defense in depth against accidentally importing secrets into client code.
 */
export const env = new Proxy(parsed.data as Record<string, unknown>, {
  get(target, prop) {
    if (typeof prop !== "string") return undefined;
    if (!isServer && !prop.startsWith("NEXT_PUBLIC_")) {
      throw new Error(
        `Attempted to access server-only env var "${prop}" from the client. This is a security violation.`,
      );
    }
    return target[prop];
  },
}) as z.infer<typeof serverSchema> & z.infer<typeof clientSchema>;
