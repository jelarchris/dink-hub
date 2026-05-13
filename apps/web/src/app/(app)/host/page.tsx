import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  CircleDollarSign,
  Mail,
  MapPin,
  Receipt,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { getCurrentBookingFeeRule } from "@/features/system-settings";
import { formatPHP } from "@/lib/money";

export const metadata: Metadata = {
  title: "List your venue — DinkHub",
  description:
    "List your pickleball court on DinkHub. Take real bookings, get paid via GCash, and stop losing players to missed messages. No setup fees, no subscription — only a small fee on confirmed bookings.",
};

export default async function HostPage() {
  const fee = await getCurrentBookingFeeRule();

  return (
    <main className="flex flex-1 flex-col">
      <Hero promoActive={fee.promoApplied} />
      <Benefits />
      <HowPaymentWorks fee={fee} />
      <Steps />
      <Trust />
      <Faq fee={fee} />
      <FinalCta />
    </main>
  );
}

function Hero({ promoActive }: { promoActive: boolean }) {
  return (
    <section className="relative overflow-hidden border-b border-[var(--color-border-default)] bg-gradient-to-b from-[var(--color-brand-50)] to-[var(--color-bg)] px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <Container className="text-center">
        <Badge variant="success" className="mx-auto">
          For venue owners
        </Badge>
        <h1 className="mt-4 text-balance text-4xl font-bold tracking-tight text-[var(--color-fg)] sm:text-5xl">
          Get found. Get booked. Get paid.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-pretty text-lg text-[var(--color-fg-muted)]">
          List your pickleball court on DinkHub for free. Players find you,
          book a slot, and pay you directly via GCash. We handle discovery,
          scheduling, and receipts — you just show up and play.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link
            href="/sign-up?role=venue_owner"
            className={buttonVariants({ variant: "default", size: "lg" })}
          >
            List your venue
            <ArrowRight className="ml-1 size-4" aria-hidden="true" />
          </Link>
          <a
            href="#how-it-works"
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            See how it works
          </a>
        </div>
        {promoActive ? (
          <p className="mx-auto mt-5 max-w-xl text-sm text-[var(--color-brand-700)]">
            <Sparkles
              className="-mt-0.5 mr-1 inline size-4"
              aria-hidden="true"
            />
            Launch promo: players pay <strong>₱0 booking fee</strong> right now — list your venue free and keep every peso.
          </p>
        ) : null}
      </Container>
    </section>
  );
}

function Benefits() {
  const items = [
    {
      icon: CalendarCheck,
      title: "Real-time bookings, no chat tag",
      body: "Players see your live calendar and book the slot they want. No more “sorry, that’s taken” messages an hour later.",
    },
    {
      icon: ShieldCheck,
      title: "Double-booking protection built in",
      body: "Database-enforced uniqueness on every court + time slot. It is physically impossible for two players to grab the same hour.",
    },
    {
      icon: Wallet,
      title: "GCash direct to you",
      body: "Players send their full payment straight to your GCash. Nothing passes through DinkHub — the money is yours immediately.",
    },
    {
      icon: TrendingUp,
      title: "Discovery in your area",
      body: "Players in Agusan del Sur (and beyond, as we grow) find your courts on the map. New customers, no ad spend.",
    },
    {
      icon: Receipt,
      title: "We chase the receipts",
      body: "Player uploads a GCash screenshot. You verify in one click. We email both parties automatically and write a clean ledger entry.",
    },
    {
      icon: CircleDollarSign,
      title: "Free to list, always",
      body: "No setup cost. No monthly subscription. Players pay a small booking fee on top of your court rate — you collect it and remit it to DinkHub weekly.",
    },
  ] as const;

  return (
    <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[var(--color-fg)] sm:text-4xl">
            Why owners switch to DinkHub
          </h2>
          <p className="mt-3 text-lg text-[var(--color-fg-muted)]">
            Built by a player who got tired of unanswered messages and double
            bookings.
          </p>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <div
              key={item.title}
              className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)] p-6 shadow-sm"
            >
              <div className="inline-flex size-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-brand-50)] text-[var(--color-brand-600)]">
                <item.icon className="size-5" aria-hidden="true" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-[var(--color-fg)]">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-fg-muted)]">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

function HowPaymentWorks({
  fee,
}: {
  fee: Awaited<ReturnType<typeof getCurrentBookingFeeRule>>;
}) {
  const baseFee = formatPHP(fee.baseCentavos);
  const liveFee = formatPHP(fee.snapshotCentavos);

  return (
    <section className="border-t border-[var(--color-border-default)] bg-[var(--color-bg-muted)] px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <Container className="max-w-4xl">
        <div className="mx-auto max-w-2xl text-center">
          <Badge variant="info" className="mx-auto">
            How payment works
          </Badge>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-[var(--color-fg)] sm:text-4xl">
            Player pays you. You remit the booking fee weekly.
          </h2>
          <p className="mt-3 text-lg text-[var(--color-fg-muted)]">
            One GCash transfer, one receipt, one clean weekly bill. Listing is always free.
          </p>
        </div>

        <div className="mt-10 rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)] p-6 shadow-sm sm:p-8">
          <ol className="space-y-6">
            <PaymentStep
              n={1}
              title="Player books a court"
              body={`Players see your court rate + a ${baseFee} booking fee at checkout.${
                fee.promoApplied
                  ? ` During the launch promo the booking fee is ${liveFee} — players pay only your court rate.`
                  : ""
              }`}
            />
            <PaymentStep
              n={2}
              title="Player sends ONE GCash transfer to your number"
              body="The full amount (your court rate + booking fee) goes straight to your GCash number. DinkHub never holds or touches your money."
            />
            <PaymentStep
              n={3}
              title="Player uploads the GCash receipt"
              body="You get an email + a row in your /owner/payments queue. One click to Verify or Reject."
            />
            <PaymentStep
              n={4}
              title="DinkHub tracks the booking fees you collected"
              body={`Each verified booking adds a ${baseFee} booking fee to your weekly invoice. Nothing is due per booking — it accumulates, then you settle once a week.`}
            />
            <PaymentStep
              n={5}
              title="Weekly invoice every Monday morning"
              body="At 6:00 AM Manila time we email you an invoice for last week's accumulated booking fees. Pay it like your players pay you — GCash + receipt upload. We verify and your balance clears."
            />
          </ol>
        </div>

        <p className="mt-6 text-center text-sm text-[var(--color-fg-muted)]">
          Listing is free. No card processing fees. No payout schedules.
          Players pay the booking fee. You collect it. You remit it once a week.
        </p>
      </Container>
    </section>
  );
}

function PaymentStep({
  n,
  title,
  body,
}: {
  n: number;
  title: string;
  body: string;
}) {
  return (
    <li className="flex gap-4">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-50)] text-sm font-semibold text-[var(--color-brand-700)]">
        {n}
      </div>
      <div>
        <h3 className="text-base font-semibold text-[var(--color-fg)]">
          {title}
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-[var(--color-fg-muted)]">
          {body}
        </p>
      </div>
    </li>
  );
}

function Steps() {
  const steps = [
    {
      title: "Sign up as a venue owner",
      body: "Email + password. Takes about 30 seconds.",
    },
    {
      title: "Add your venue",
      body: "Name, address, GCash number, GCash QR, and a pin on the map so players can find you.",
    },
    {
      title: "Add your courts and hours",
      body: "Court name, hourly rate in PHP, and your operating hours. Add as many courts as you have.",
    },
    {
      title: "Go live",
      body: "Your venue appears on dinkhub.ph/venues immediately. Bookings start flowing.",
    },
  ] as const;

  return (
    <section
      id="how-it-works"
      className="border-t border-[var(--color-border-default)] px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
    >
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[var(--color-fg)] sm:text-4xl">
            Live in under 10 minutes
          </h2>
          <p className="mt-3 text-lg text-[var(--color-fg-muted)]">
            Four steps, all self-serve. No sales call required.
          </p>
        </div>

        <ol className="mx-auto mt-12 grid max-w-4xl gap-4 sm:grid-cols-2">
          {steps.map((s, i) => (
            <li
              key={s.title}
              className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)] p-6 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className="flex size-8 items-center justify-center rounded-full bg-[var(--color-brand-50)] text-sm font-bold text-[var(--color-brand-700)]">
                  {i + 1}
                </div>
                <h3 className="text-base font-semibold text-[var(--color-fg)]">
                  {s.title}
                </h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-[var(--color-fg-muted)]">
                {s.body}
              </p>
            </li>
          ))}
        </ol>

        <div className="mt-10 flex justify-center">
          <Link
            href="/sign-up?role=venue_owner"
            className={buttonVariants({ variant: "default", size: "lg" })}
          >
            Start listing now
            <ArrowRight className="ml-1 size-4" aria-hidden="true" />
          </Link>
        </div>
      </Container>
    </section>
  );
}

function Trust() {
  const items = [
    {
      icon: MapPin,
      title: "Built in Agusan del Sur",
      body: "We started here, we play here, we know the venues here. PH-first, not bolted on.",
    },
    {
      icon: ShieldCheck,
      title: "Your data is yours",
      body: "Row-level security on every record. Owners only ever see their own bookings, payments, and players.",
    },
    {
      icon: Mail,
      title: "Real human support",
      body: "Email the founder directly. No ticket queue, no chatbot tree.",
    },
  ] as const;

  return (
    <section className="border-t border-[var(--color-border-default)] bg-[var(--color-bg-muted)] px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[var(--color-fg)] sm:text-4xl">
            Why owners trust us
          </h2>
        </div>
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {items.map((item) => (
            <div
              key={item.title}
              className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)] p-6 shadow-sm"
            >
              <div className="inline-flex size-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-brand-50)] text-[var(--color-brand-600)]">
                <item.icon className="size-5" aria-hidden="true" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-[var(--color-fg)]">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-fg-muted)]">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

function Faq({
  fee,
}: {
  fee: Awaited<ReturnType<typeof getCurrentBookingFeeRule>>;
}) {
  const baseFee = formatPHP(fee.baseCentavos);
  const liveFee = formatPHP(fee.snapshotCentavos);

  const items: { q: string; a: string }[] = [
    {
      q: "How much does DinkHub cost me?",
      a: fee.promoApplied
        ? `Listing your venue is completely free — no setup cost, no monthly subscription. Right now during our launch promo, the booking fee for players is ${liveFee}. Normally a flat ${baseFee} booking fee is added to each player's checkout on top of your court rate. You collect it with their payment, then remit it to DinkHub on your weekly invoice.`
        : `Listing your venue is completely free — no setup cost, no monthly subscription, no hidden charges. A flat ${baseFee} booking fee is added to each player's checkout on top of your court rate. You collect it with their payment, then remit it to DinkHub on your weekly invoice.`,
    },
    {
      q: "When do I get paid?",
      a: "Immediately. The player sends the full amount (your court rate + booking fee) directly to your GCash. DinkHub never holds your money — it lands in your account the moment they pay.",
    },
    {
      q: "How does DinkHub collect the booking fees?",
      a: "Every Monday morning we email you an invoice totaling the booking fees from the previous week's confirmed bookings. You pay it via GCash and upload a receipt — the same flow your players use.",
    },
    {
      q: "What if I miss a weekly invoice?",
      a: "We'll send a reminder. If an invoice stays unpaid your venue listing pauses (existing bookings stay safe). It resumes the moment we verify your payment.",
    },
    {
      q: "What if a player doesn't show up?",
      a: "Mark the booking as a no-show in your dashboard. The booking fee on no-shows is waived from your weekly invoice — you only remit fees on bookings the player actually used.",
    },
    {
      q: "Can I cancel a booking?",
      a: "Yes, owners can cancel or reschedule from /owner/bookings. The player gets an automatic email with the new details (or a refund prompt if you cancel outright).",
    },
    {
      q: "Do players need an account?",
      a: "Yes — verified email accounts only. We use Cloudflare Turnstile and rate limits to keep bots and prank bookings out.",
    },
    {
      q: "What about GCash refunds?",
      a: "If you need to refund a player, send the money back via GCash and record it in your dashboard. We reverse the booking fee on your next weekly invoice — so you only remit fees on bookings that actually happened.",
    },
  ];

  return (
    <section className="border-t border-[var(--color-border-default)] px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <Container className="max-w-3xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[var(--color-fg)] sm:text-4xl">
            Questions owners ask us
          </h2>
        </div>
        <ul className="mt-10 space-y-3">
          {items.map((item) => (
            <li
              key={item.q}
              className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)] shadow-sm"
            >
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 text-left text-base font-semibold text-[var(--color-fg)]">
                  <span>{item.q}</span>
                  <span
                    aria-hidden="true"
                    className="text-[var(--color-fg-muted)] transition-transform group-open:rotate-180"
                  >
                    ▾
                  </span>
                </summary>
                <p className="px-5 pb-5 text-sm leading-relaxed text-[var(--color-fg-muted)]">
                  {item.a}
                </p>
              </details>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="border-t border-[var(--color-border-default)] px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <Container>
        <div className="relative overflow-hidden rounded-[var(--radius-lg)] bg-gradient-to-br from-[var(--color-brand-700)] via-[var(--color-brand-600)] to-[var(--color-accent-600)] p-8 text-white sm:p-12">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-15 [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:32px_32px]"
          />
          <div className="relative mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Ready to fill your courts?
            </h2>
            <p className="mt-3 text-base text-white/85 sm:text-lg">
              Sign up free. List in under 10 minutes. Take real bookings the
              same day.
            </p>
            <ul className="mx-auto mt-6 grid max-w-xl gap-3 text-left text-sm sm:grid-cols-2">
              {[
                "Free to list — always",
                "No subscription",
                "Booking fee paid by players",
                "Cancel listing anytime",
              ].map((b) => (
                <li key={b} className="flex items-start gap-2">
                  <CheckCircle2
                    className="mt-0.5 size-5 shrink-0"
                    aria-hidden="true"
                  />
                  <span className="text-white/90">{b}</span>
                </li>
              ))}
            </ul>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link
                href="/sign-up?role=venue_owner"
                className={`${buttonVariants({ size: "lg" })} bg-white text-[var(--color-brand-700)] hover:bg-white/90`}
              >
                List your venue
                <ArrowRight className="ml-1 size-4" aria-hidden="true" />
              </Link>
              <a
                href="mailto:dinkhubofficial@gmail.com"
                className={`${buttonVariants({ size: "lg", variant: "ghost" })} text-white hover:bg-white/10`}
              >
                <Mail className="mr-1 size-4" aria-hidden="true" />
                Talk to the founder
              </a>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
