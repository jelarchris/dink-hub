import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How DinkHub collects, uses, and protects your personal information in compliance with the Philippine Data Privacy Act of 2012 (RA 10173).",
};

// Last material revision date — update this whenever the policy content changes.
const LAST_UPDATED = "May 13, 2026";

export default function PrivacyPage() {
  return (
    <main className="flex flex-1 flex-col py-12 sm:py-16">
      <Container className="max-w-3xl">
        <div className="mb-10 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-fg-muted)]">
            Legal
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--color-fg)] sm:text-4xl">
            Privacy Policy
          </h1>
          <p className="text-sm text-[var(--color-fg-muted)]">
            Last updated: {LAST_UPDATED}
          </p>
        </div>

        <div className="prose-policy space-y-10 text-[var(--color-fg-muted)]">
          <Section title="1. Who we are">
            <p>
              DinkHub (&ldquo;DinkHub,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;)
              is a pickleball court booking marketplace operated in the Philippines.
              We are the Personal Information Controller for the data described in this policy.
            </p>
            <p>
              Contact:{" "}
              <a href="mailto:privacy@dinkhub.ph" className="text-[var(--color-brand-600)] hover:underline">
                privacy@dinkhub.ph
              </a>
            </p>
          </Section>

          <Section title="2. Scope and legal basis">
            <p>
              This policy applies to all personal information we collect when you use{" "}
              <Link href="/" className="text-[var(--color-brand-600)] hover:underline">
                dinkhub.ph
              </Link>{" "}
              and its sub-pages (collectively, the &ldquo;Platform&rdquo;).
            </p>
            <p>
              We process your personal information on the following legal bases under the{" "}
              <strong>Philippine Data Privacy Act of 2012 (Republic Act No. 10173)</strong> and its
              Implementing Rules and Regulations:
            </p>
            <ul>
              <li>
                <strong>Contract performance</strong> — to create and manage your account, process
                bookings, verify payments, and provide customer support.
              </li>
              <li>
                <strong>Legitimate interest</strong> — to improve the Platform, detect fraud, and
                send transactional notifications you reasonably expect.
              </li>
              <li>
                <strong>Consent</strong> — for optional features such as marketing emails and
                analytics cookies, where you have explicitly opted in.
              </li>
              <li>
                <strong>Legal obligation</strong> — where required by Philippine law.
              </li>
            </ul>
          </Section>

          <Section title="3. Information we collect">
            <Subsection title="3.1 Information you provide">
              <ul>
                <li>
                  <strong>Account data</strong> — display name, email address, and password (stored
                  as a salted hash; never readable by us).
                </li>
                <li>
                  <strong>Profile data</strong> — phone number (optional), gender (optional), and
                  city of residence (optional).
                </li>
                <li>
                  <strong>Booking data</strong> — court selections, date and time preferences, and
                  any notes you attach to a booking.
                </li>
                <li>
                  <strong>Payment receipts</strong> — GCash receipt images you upload to confirm
                  payment. These are stored in a private, access-controlled bucket and are accessible
                  only to the relevant venue owner, platform administrators, and you.
                </li>
                <li>
                  <strong>Venue data (owners only)</strong> — venue name, address, GPS coordinates,
                  GCash account name, GCash account number, and court photos.
                </li>
                <li>
                  <strong>Reviews</strong> — star ratings and written reviews you post about venues.
                </li>
              </ul>
            </Subsection>
            <Subsection title="3.2 Information collected automatically">
              <ul>
                <li>
                  <strong>Usage data</strong> — pages visited, buttons clicked, search queries, and
                  session duration, collected via PostHog analytics (anonymised where possible).
                </li>
                <li>
                  <strong>Error and performance data</strong> — error messages, stack traces, and
                  device/browser information, collected via Sentry for debugging purposes.
                </li>
                <li>
                  <strong>IP address</strong> — used for rate limiting and fraud prevention via
                  Cloudflare Turnstile. Not stored in our primary database.
                </li>
                <li>
                  <strong>Cookies</strong> — we use session cookies for authentication (managed by
                  Supabase Auth) and a preference cookie to remember your chosen colour theme. We
                  do not use advertising or tracking cookies.
                </li>
              </ul>
            </Subsection>
          </Section>

          <Section title="4. How we use your information">
            <ul>
              <li>Create and manage your account and authenticate your sessions.</li>
              <li>Process, confirm, and manage court bookings.</li>
              <li>Facilitate GCash payment verification between players and venue owners.</li>
              <li>
                Calculate and deduct the DinkHub platform fee from venue owners&apos; weekly payouts.
              </li>
              <li>Send transactional emails (booking confirmations, payment status, cancellations).</li>
              <li>Send optional SMS notifications (only if you opt in and provide a phone number).</li>
              <li>Detect and prevent fraud, abuse, and policy violations.</li>
              <li>Improve the Platform through aggregated, anonymised analytics.</li>
              <li>Comply with applicable Philippine law and respond to lawful requests.</li>
            </ul>
            <p>
              We will never sell your personal information to third parties.
            </p>
          </Section>

          <Section title="5. How we share your information">
            <p>
              We share personal information only as necessary to operate the Platform:
            </p>
            <ul>
              <li>
                <strong>Venue owners</strong> — when you make a booking, the venue owner receives
                your display name, booking details, and your GCash receipt image. They do not
                receive your email address or phone number unless you choose to provide it.
              </li>
              <li>
                <strong>Players</strong> — venue owners&apos; GCash account names and QR codes are
                visible to players completing a payment. Full account numbers are not displayed to
                players.
              </li>
              <li>
                <strong>Service providers</strong> — we use the following sub-processors, each bound
                by data processing agreements:
                <ul>
                  <li>
                    <strong>Supabase Inc. (USA)</strong> — database, authentication, and file
                    storage.
                  </li>
                  <li>
                    <strong>Vercel Inc. (USA)</strong> — web hosting and edge network.
                  </li>
                  <li>
                    <strong>Resend Inc. (USA)</strong> — transactional email delivery.
                  </li>
                  <li>
                    <strong>Semaphore (Philippines)</strong> — optional SMS notifications.
                  </li>
                  <li>
                    <strong>PostHog Inc. (USA)</strong> — product analytics (anonymised).
                  </li>
                  <li>
                    <strong>Sentry (USA)</strong> — error monitoring (stack traces, no PII logged).
                  </li>
                  <li>
                    <strong>Cloudflare Inc. (USA)</strong> — security, DDoS mitigation, and CAPTCHA.
                  </li>
                  <li>
                    <strong>Upstash Inc. (USA)</strong> — rate limiting counters (IP hashes only).
                  </li>
                </ul>
              </li>
              <li>
                <strong>Legal requirements</strong> — we may disclose information if required by
                Philippine law, court order, or lawful government request.
              </li>
            </ul>
          </Section>

          <Section title="6. Data retention">
            <ul>
              <li>
                <strong>Account data</strong> — retained for the life of your account, plus 3 years
                after deletion to satisfy audit and legal obligations.
              </li>
              <li>
                <strong>Booking and payment records</strong> — retained for 7 years to comply with
                applicable Philippine tax and commercial regulations.
              </li>
              <li>
                <strong>GCash receipt images</strong> — retained for 1 year from the booking date,
                then permanently deleted from storage.
              </li>
              <li>
                <strong>Analytics data</strong> — aggregated; individual session data is
                anonymised after 90 days.
              </li>
              <li>
                <strong>Error logs</strong> — retained for 30 days then purged.
              </li>
            </ul>
          </Section>

          <Section title="7. Your rights under RA 10173">
            <p>
              As a data subject under the Philippine Data Privacy Act, you have the right to:
            </p>
            <ul>
              <li>
                <strong>Access</strong> — request a copy of the personal information we hold about
                you.
              </li>
              <li>
                <strong>Correction</strong> — request correction of inaccurate or incomplete
                information.
              </li>
              <li>
                <strong>Erasure / blocking</strong> — request deletion of your data, subject to our
                legal retention obligations.
              </li>
              <li>
                <strong>Object</strong> — object to specific processing activities.
              </li>
              <li>
                <strong>Data portability</strong> — request a copy of your data in a
                structured, machine-readable format.
              </li>
              <li>
                <strong>Lodge a complaint</strong> — file a complaint with the National Privacy
                Commission at{" "}
                <a
                  href="https://www.privacy.gov.ph"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--color-brand-600)] hover:underline"
                >
                  privacy.gov.ph
                </a>
                .
              </li>
            </ul>
            <p>
              To exercise any of these rights, email us at{" "}
              <a href="mailto:privacy@dinkhub.ph" className="text-[var(--color-brand-600)] hover:underline">
                privacy@dinkhub.ph
              </a>
              . We will respond within 15 business days as required by law.
            </p>
          </Section>

          <Section title="8. Data security">
            <p>
              We apply industry-standard measures to protect your information:
            </p>
            <ul>
              <li>All data in transit is encrypted via TLS 1.2+.</li>
              <li>
                Database access is controlled by row-level security policies — no query can access
                another user&apos;s data.
              </li>
              <li>
                GCash receipt images are stored in a private bucket with short-lived signed URLs
                (5-minute expiry); they are never publicly accessible.
              </li>
              <li>Passwords are hashed using bcrypt; we never store or log plain-text passwords.</li>
              <li>
                Sensitive keys (service credentials, API keys) are stored as encrypted environment
                variables and never included in source code.
              </li>
            </ul>
            <p>
              No method of transmission or storage is 100% secure. If you become aware of any
              security concern, please contact us immediately at{" "}
              <a href="mailto:privacy@dinkhub.ph" className="text-[var(--color-brand-600)] hover:underline">
                privacy@dinkhub.ph
              </a>
              .
            </p>
          </Section>

          <Section title="9. Children's privacy">
            <p>
              The Platform is not directed at children under 18 years of age. We do not knowingly
              collect personal information from children. If you believe a child has created an
              account, please contact us and we will promptly delete the data.
            </p>
          </Section>

          <Section title="10. Changes to this policy">
            <p>
              We may update this policy from time to time. Material changes will be notified by
              email or by a prominent notice on the Platform at least 14 days before they take
              effect. The &ldquo;Last updated&rdquo; date at the top of this page reflects the most
              recent revision.
            </p>
            <p>
              Your continued use of the Platform after a notified change constitutes acceptance of
              the updated policy.
            </p>
          </Section>

          <Section title="11. Contact us">
            <p>
              For privacy-related enquiries, requests to exercise your rights, or to report a data
              breach:
            </p>
            <address className="not-italic">
              <strong>DinkHub — Data Privacy Office</strong>
              <br />
              Email:{" "}
              <a href="mailto:privacy@dinkhub.ph" className="text-[var(--color-brand-600)] hover:underline">
                privacy@dinkhub.ph
              </a>
              <br />
              Operating in: Agusan del Sur, Philippines
            </address>
          </Section>
        </div>
      </Container>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-[var(--color-fg)]">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed sm:text-base">{children}</div>
    </section>
  );
}

function Subsection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-[var(--color-fg)] sm:text-base">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
