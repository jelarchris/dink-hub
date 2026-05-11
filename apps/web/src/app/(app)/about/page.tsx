import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Calendar, MapPin, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = {
  title: "About — DinkHub",
  description:
    "The story behind DinkHub: built by a pickleball player in Agusan del Sur to make booking courts in the Philippines as easy as ordering food online.",
};

export default function AboutPage() {
  return (
    <main className="flex flex-1 flex-col">
      <Hero />
      <Story />
      <Mission />
      <FounderCard />
    </main>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-[var(--color-border-default)] bg-gradient-to-b from-[var(--color-brand-50)] to-[var(--color-bg)] px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <Container className="text-center">
        <Badge variant="success" className="mx-auto">
          Our story
        </Badge>
        <h1 className="mt-4 text-balance text-4xl font-bold tracking-tight text-[var(--color-fg)] sm:text-5xl">
          Built by a player, for players.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-pretty text-lg text-[var(--color-fg-muted)]">
          DinkHub started with a simple frustration: there was no easy way to
          see which pickleball courts were free in Agusan del Sur — let alone
          book one.
        </p>
      </Container>
    </section>
  );
}

function Story() {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <Container className="max-w-3xl">
        <div className="prose prose-neutral max-w-none space-y-5 text-[var(--color-fg-muted)]">
          <p className="text-lg leading-relaxed">
            I&apos;m a pickleball player myself. Here in Agusan del Sur, every
            time I wanted to play, I had to message or call the venue and wait
            for a reply just to find out if a slot was even open. Sometimes
            the venue replied an hour later. Sometimes not at all. By the
            time I got a confirmation, the court was already taken — or the
            people I was supposed to play with had moved on.
          </p>
          <p className="text-lg leading-relaxed">
            There was no shared calendar. No real-time availability. No way to
            book and pay in one place. Just a group chat, a few screenshots,
            and a lot of waiting.
          </p>
          <p className="text-lg leading-relaxed">
            So I built DinkHub — the platform I wished existed when I picked
            up a paddle for the first time. A place where any player can see
            which courts are free tonight, this weekend, or two weeks from
            now, and reserve one in under a minute. And a place where venue
            owners stop losing bookings to missed messages.
          </p>
        </div>
      </Container>
    </section>
  );
}

function Mission() {
  const pillars = [
    {
      icon: Calendar,
      title: "Real-time availability",
      body: "See open courts and time slots the moment you land on a venue page. No more guessing, no more waiting on a reply.",
    },
    {
      icon: Sparkles,
      title: "Book in under a minute",
      body: "Pick a court, pick a time, send GCash, upload a receipt. The venue confirms — you play. That's the whole flow.",
    },
    {
      icon: MapPin,
      title: "Built for the Philippines",
      body: "Manila timezone, Philippine Peso, GCash payments, and venues we visit ourselves. Starting in Agusan, growing nationwide.",
    },
  ] as const;

  return (
    <section className="border-t border-[var(--color-border-default)] bg-[var(--color-bg-muted)] px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[var(--color-fg)] sm:text-4xl">
            What we&apos;re building
          </h2>
          <p className="mt-3 text-lg text-[var(--color-fg-muted)]">
            DinkHub exists to make pickleball easier to play and easier to run.
          </p>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {pillars.map((p) => (
            <div
              key={p.title}
              className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)] p-6 shadow-sm"
            >
              <div className="inline-flex size-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-brand-50)] text-[var(--color-brand-600)]">
                <p.icon className="size-5" aria-hidden="true" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-[var(--color-fg)]">
                {p.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-fg-muted)]">
                {p.body}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

function FounderCard() {
  return (
    <section className="border-t border-[var(--color-border-default)] px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <Container className="max-w-3xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[var(--color-fg)] sm:text-4xl">
            The founder
          </h2>
        </div>

        <div className="mt-10 flex flex-col items-center gap-6 rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)] p-8 shadow-sm sm:flex-row sm:items-start sm:gap-8 sm:text-left">
          <div className="relative size-28 shrink-0 overflow-hidden rounded-full ring-4 ring-[var(--color-brand-50)] sm:size-32">
            <Image
              src="/founder.jpg"
              alt="Christian Jelar Joy D. Hisola"
              fill
              sizes="128px"
              className="object-cover"
              priority
            />
          </div>
          <div className="flex-1 text-center sm:text-left">
            <h3 className="text-xl font-bold text-[var(--color-fg)]">
              Christian Jelar Joy D. Hisola
            </h3>
            <p className="mt-1 text-sm font-medium text-[var(--color-brand-600)]">
              Founder · DinkHub
            </p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--color-fg-muted)]">
              Pickleball player based in Agusan del Sur. Building DinkHub
              solo — one venue, one booking, one happy player at a time.
            </p>
            <div className="mt-5 flex justify-center sm:justify-start">
              <a
                href="https://www.facebook.com/jelarjoychristian"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg)] px-4 py-2 text-sm font-medium text-[var(--color-fg)] shadow-sm transition-colors hover:border-[var(--color-brand-500)] hover:text-[var(--color-brand-600)]"
              >
                <svg
                  className="size-4"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M22 12a10 10 0 10-11.563 9.876v-6.987H7.898V12h2.539V9.797c0-2.506 1.493-3.89 3.776-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.889h-2.33v6.987A10.002 10.002 0 0022 12z" />
                </svg>
                Connect on Facebook
              </a>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center gap-4 text-center">
          <p className="text-sm text-[var(--color-fg-muted)]">
            Want to list your venue or partner with us?
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/sign-up?role=venue_owner"
              className={buttonVariants({ variant: "default", size: "lg" })}
            >
              List your venue
              <ArrowRight className="ml-1 size-4" aria-hidden="true" />
            </Link>
            <a
              href="mailto:dinkhubofficial@gmail.com"
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              Email us
            </a>
          </div>
        </div>
      </Container>
    </section>
  );
}
