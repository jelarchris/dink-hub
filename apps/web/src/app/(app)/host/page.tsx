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
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = {
  title: "List your venue — DinkHub",
  description:
    "List your pickleball court on DinkHub. Get discovered by local players, take real bookings, and get paid via GCash. Free to list — no setup required.",
};

export default async function HostPage() {
  return (
    <main className="flex flex-1 flex-col">
      <Hero />
      <Benefits />
      <HowPaymentWorks />
      <Steps />
      <Trust />
      <Faq />
      <FinalCta />
    </main>
  );
}

function Hero() {
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
      body: "No setup cost. No monthly subscription. List your courts and start taking real bookings today.",
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

function HowPaymentWorks() {
  return (
    <section className="border-t border-[var(--color-border-default)] bg-[var(--color-bg-muted)] px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <Container className="max-w-4xl">
        <div className="mx-auto max-w-2xl text-center">
          <Badge variant="info" className="mx-auto">
            How payment works
          </Badge>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-[var(--color-fg)] sm:text-4xl">
            Player books. Player pays. You play.
          </h2>
          <p className="mt-3 text-lg text-[var(--color-fg-muted)]">
            The simplest booking flow in PH pickleball. No middleman, no waiting.
          </p>
        </div>

        <div className="mt-10 rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)] p-6 shadow-sm sm:p-8">
          <ol className="space-y-6">
            <PaymentStep
              n={1}
              title="Player picks a slot"
              body="They browse your live calendar, pick a date and time, and confirm the booking in seconds."
            />
            <PaymentStep
              n={2}
              title="Player sends GCash directly to you"
              body="One transfer to your GCash number. No middleman, no payout delays — the money is yours immediately."
            />
            <PaymentStep
              n={3}
              title="Player uploads the receipt"
              body="You get notified instantly. Open your dashboard, review the screenshot, and tap Verify in one click."
            />
            <PaymentStep
              n={4}
              title="Court confirmed — calendar blocked"
              body="DinkHub sends confirmation to both you and the player. The slot is locked. Double bookings are physically impossible."
            />
          </ol>
        </div>
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

function Faq() {
  const items: { q: string; a: string }[] = [
    {
      q: "Is it free to list my venue?",
      a: "Yes — listing your venue is completely free. No setup cost, no monthly subscription. Get in touch with us to learn how our partnership model works.",
    },
    {
      q: "When do I get paid?",
      a: "Immediately. Players send payment directly to your GCash number. DinkHub never holds or touches your money.",
    },
    {
      q: "What if a player doesn't show up?",
      a: "Mark the booking as a no-show in your dashboard. We track it so your records stay accurate.",
    },
    {
      q: "Can I cancel a booking?",
      a: "Yes — you can cancel or reschedule from your dashboard. The player gets an automatic email with the updated details.",
    },
    {
      q: "Can I pause my listing?",
      a: "Yes. You can unpublish your venue anytime from your owner settings. Existing confirmed bookings stay intact.",
    },
    {
      q: "Do players need an account?",
      a: "Yes — verified email accounts only. We use per-user rate limits to keep prank bookings out.",
    },
    {
      q: "What about GCash refunds?",
      a: "If you need to refund a player, send the money back via GCash and record it in your dashboard. We track it so your booking history stays accurate.",
    },
    {
      q: "When will DinkHub expand beyond Agusan del Sur?",
      a: "We're growing actively. If you have a court in another city, list it — you'll be among the first in your area.",
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
                "Free to list",
                "No subscription",
                "GCash direct to you",
                "Cancel anytime",
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
