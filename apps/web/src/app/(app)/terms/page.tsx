import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The terms that govern your use of DinkHub — the pickleball court booking marketplace for the Philippines.",
};

const LAST_UPDATED = "May 13, 2026";
const EFFECTIVE_DATE = "May 13, 2026";

export default function TermsPage() {
  return (
    <main className="flex flex-1 flex-col py-12 sm:py-16">
      <Container className="max-w-3xl">
        <div className="mb-10 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-fg-muted)]">
            Legal
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--color-fg)] sm:text-4xl">
            Terms of Service
          </h1>
          <p className="text-sm text-[var(--color-fg-muted)]">
            Last updated: {LAST_UPDATED} &mdash; Effective: {EFFECTIVE_DATE}
          </p>
        </div>

        <div className="space-y-10 text-[var(--color-fg-muted)]">
          <Section title="1. Acceptance of terms">
            <p>
              By creating an account or using{" "}
              <Link href="/" className="text-[var(--color-brand-600)] hover:underline">
                dinkhub.ph
              </Link>{" "}
              (the &ldquo;Platform&rdquo;), you agree to be bound by these Terms of Service
              (&ldquo;Terms&rdquo;) and our{" "}
              <Link href="/privacy" className="text-[var(--color-brand-600)] hover:underline">
                Privacy Policy
              </Link>
              . If you do not agree, do not use the Platform.
            </p>
            <p>
              These Terms are governed by and construed in accordance with the laws of the Republic
              of the Philippines. Any dispute arising from these Terms shall be subject to the
              exclusive jurisdiction of the courts of the Philippines.
            </p>
          </Section>

          <Section title="2. What DinkHub is">
            <p>
              DinkHub is an online marketplace that connects pickleball players (&ldquo;Players&rdquo;)
              with pickleball court operators (&ldquo;Venue Owners&rdquo;) in the Philippines.
            </p>
            <p>
              <strong>DinkHub is a marketplace, not a party to the booking contract.</strong>{" "}
              The booking agreement is between the Player and the Venue Owner. DinkHub facilitates
              the booking process and payment flow, but is not responsible for the actual provision
              of court time or for disputes between Players and Venue Owners.
            </p>
          </Section>

          <Section title="3. Accounts">
            <Subsection title="3.1 Eligibility">
              <p>
                You must be at least 18 years old to create an account. By registering, you confirm
                that the information you provide is accurate and that you have the legal capacity to
                enter into these Terms.
              </p>
            </Subsection>
            <Subsection title="3.2 Account security">
              <p>
                You are responsible for maintaining the confidentiality of your password and for all
                activity that occurs under your account. Notify us immediately at{" "}
                <a
                  href="mailto:support@dinkhub.ph"
                  className="text-[var(--color-brand-600)] hover:underline"
                >
                  support@dinkhub.ph
                </a>{" "}
                if you suspect unauthorised access.
              </p>
            </Subsection>
            <Subsection title="3.3 Account types">
              <ul>
                <li>
                  <strong>Player</strong> — can discover venues, hold and create bookings, upload
                  payment receipts, and post reviews.
                </li>
                <li>
                  <strong>Venue Owner</strong> — can list venues and courts, manage availability,
                  receive and verify player payments, and respond to reviews. Venue listings are
                  subject to review and approval by DinkHub before becoming publicly visible.
                </li>
              </ul>
            </Subsection>
          </Section>

          <Section title="4. Booking process">
            <Subsection title="4.1 Slot holds">
              <p>
                When you begin a booking, your selected time slot is temporarily held for
                <strong> 15 minutes</strong>. If you do not complete the booking within that time,
                the hold expires automatically and the slot becomes available to others.
              </p>
            </Subsection>
            <Subsection title="4.2 Creating a booking">
              <p>
                A booking is created when you confirm your selected court, date, and time. At the
                moment of booking, the applicable platform fee is locked in and will not change even
                if the platform fee is subsequently updated by DinkHub.
              </p>
              <p>
                Bookings have a minimum duration of <strong>30 minutes</strong> and a maximum of{" "}
                <strong>4 hours</strong>, in 30-minute increments.
              </p>
            </Subsection>
            <Subsection title="4.3 Payment">
              <p>
                DinkHub uses a <strong>manual GCash payment flow</strong>:
              </p>
              <ol>
                <li>
                  After creating a booking, you will see the venue&apos;s GCash details. You must
                  send the full payment (court fee + platform fee, if applicable) in a{" "}
                  <strong>single GCash transfer to the venue</strong>.
                </li>
                <li>
                  Upload your GCash receipt screenshot through the Platform within{" "}
                  <strong>15 minutes</strong> of creating the booking. Failure to upload within
                  this window may result in the booking being expired.
                </li>
                <li>
                  The venue owner reviews your receipt and either confirms or rejects it. You will
                  be notified by email of the outcome.
                </li>
              </ol>
              <p>
                DinkHub does not process or hold payments directly. All funds transfer from Player
                to Venue Owner via GCash. DinkHub collects its platform fee by deducting it from
                the Venue Owner&apos;s weekly payout.
              </p>
            </Subsection>
            <Subsection title="4.4 Cancellations">
              <p>
                Players may cancel a booking <strong>within 15 minutes of creating it</strong> via
                the Platform. After this window, cancellations are at the discretion of the Venue
                Owner. DinkHub does not guarantee refunds for late cancellations; any refund
                arrangement is solely between the Player and the Venue Owner.
              </p>
              <p>
                Venue Owners may cancel a booking at any time (e.g. due to court unavailability or
                extreme weather). DinkHub encourages Venue Owners to provide reasonable advance
                notice and, where possible, to offer a reschedule.
              </p>
            </Subsection>
          </Section>

          <Section title="5. Platform fee">
            <p>
              DinkHub charges a platform fee per confirmed booking. The applicable fee rate is
              displayed at the time of booking and is locked in at that point. Venue Owners accept
              that the platform fee is deducted from their weekly payout; Players pay the total
              amount (court fee + platform fee) directly to the Venue Owner via GCash.
            </p>
            <p>
              DinkHub reserves the right to change the platform fee rate for future bookings. Any
              such change will be notified to Venue Owners with at least 14 days&apos; advance
              notice. Existing confirmed bookings are unaffected by fee changes.
            </p>
            <p>
              During any promotional period, the platform fee may be waived entirely. The end date
              and conditions of any promotion are displayed on the Platform and may change at our
              discretion with reasonable notice.
            </p>
          </Section>

          <Section title="6. Venue owner obligations">
            <p>Venue Owners agree to:</p>
            <ul>
              <li>
                Provide accurate and up-to-date information about their venues, courts, pricing, and
                availability.
              </li>
              <li>
                Honour all confirmed bookings unless extraordinary circumstances prevent it, and
                notify affected Players as soon as possible.
              </li>
              <li>
                Verify GCash receipts promptly (within 24 hours of upload) and reject only
                fraudulent or incorrect receipts with a clear reason.
              </li>
              <li>
                Not accept payment outside the Platform for bookings created through DinkHub.
              </li>
              <li>Maintain a safe, accessible, and accurately described venue for Players.</li>
            </ul>
          </Section>

          <Section title="7. Player obligations">
            <p>Players agree to:</p>
            <ul>
              <li>Provide accurate personal information and a valid GCash-capable account.</li>
              <li>
                Arrive on time for booked slots and respect the court rules set by the Venue Owner.
              </li>
              <li>
                Upload only legitimate GCash receipts for their own payments. Uploading fraudulent
                receipts is a serious violation and may result in immediate account suspension and
                legal action.
              </li>
              <li>
                Leave the court in the condition it was found; any damage may be subject to a
                claim by the Venue Owner.
              </li>
            </ul>
          </Section>

          <Section title="8. Reviews">
            <p>
              Players may submit a review for a completed and confirmed booking. Reviews must be
              honest, based on your own experience, and must not contain defamatory, offensive, or
              false content. DinkHub reserves the right to remove reviews that violate these
              standards. Venue Owners may post a single reply to each review.
            </p>
          </Section>

          <Section title="9. Prohibited conduct">
            <p>You must not use the Platform to:</p>
            <ul>
              <li>Create fake accounts or impersonate others.</li>
              <li>Post fraudulent payment receipts.</li>
              <li>
                Manipulate reviews (e.g. incentivising fake positive reviews or coordinating fake
                negative reviews against competitors).
              </li>
              <li>
                Scrape, reproduce, or redistribute Platform content without written permission.
              </li>
              <li>Attempt to interfere with the Platform&apos;s security or infrastructure.</li>
              <li>Engage in any activity that violates Philippine law.</li>
            </ul>
            <p>
              Violations may result in immediate account suspension or termination without notice.
            </p>
          </Section>

          <Section title="10. Intellectual property">
            <p>
              The DinkHub name, logo, brand, and all Platform content (excluding user-generated
              content) are the intellectual property of DinkHub. You may not reproduce, modify,
              or distribute them without prior written consent.
            </p>
            <p>
              You retain ownership of content you submit (reviews, venue photos). By submitting
              content, you grant DinkHub a non-exclusive, royalty-free, worldwide licence to display
              and use that content on the Platform.
            </p>
          </Section>

          <Section title="11. Disclaimers and limitation of liability">
            <p>
              The Platform is provided &ldquo;as is&rdquo; and &ldquo;as available.&rdquo; DinkHub
              does not warrant that the Platform will be error-free, uninterrupted, or free from
              harmful components.
            </p>
            <p>
              DinkHub is not responsible for:
            </p>
            <ul>
              <li>
                The quality, safety, or legality of any venue or court listed on the Platform.
              </li>
              <li>
                The accuracy of availability information provided by Venue Owners.
              </li>
              <li>
                Disputes between Players and Venue Owners over payments, cancellations, or court
                conditions.
              </li>
              <li>
                Any loss, injury, or damage arising from your use of a venue.
              </li>
            </ul>
            <p>
              To the fullest extent permitted by Philippine law, DinkHub&apos;s total liability to
              you for any claim arising from these Terms or the Platform shall not exceed the
              amount of platform fees you paid in the 3 months preceding the claim.
            </p>
          </Section>

          <Section title="12. Termination">
            <p>
              You may delete your account at any time by contacting us at{" "}
              <a
                href="mailto:support@dinkhub.ph"
                className="text-[var(--color-brand-600)] hover:underline"
              >
                support@dinkhub.ph
              </a>
              . Account deletion is subject to our data retention obligations described in the
              Privacy Policy.
            </p>
            <p>
              DinkHub may suspend or terminate your account if you violate these Terms, with or
              without notice depending on the severity of the violation.
            </p>
          </Section>

          <Section title="13. Changes to these terms">
            <p>
              We may update these Terms from time to time. Material changes will be notified by
              email or by a prominent notice on the Platform at least 14 days before they take
              effect. Continued use of the Platform after the effective date constitutes acceptance
              of the updated Terms.
            </p>
          </Section>

          <Section title="14. Contact">
            <address className="not-italic space-y-1 text-sm sm:text-base">
              <strong>DinkHub</strong>
              <br />
              General enquiries:{" "}
              <a
                href="mailto:support@dinkhub.ph"
                className="text-[var(--color-brand-600)] hover:underline"
              >
                support@dinkhub.ph
              </a>
              <br />
              Privacy enquiries:{" "}
              <a
                href="mailto:privacy@dinkhub.ph"
                className="text-[var(--color-brand-600)] hover:underline"
              >
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
