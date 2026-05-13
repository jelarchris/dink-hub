import Link from "next/link";
import { OpenPlayTeaserForm } from "@/features/open-play-interest/components/open-play-teaser-form";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  CreditCard,
  MapPin,
  Search,
  ShieldCheck,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

import { listActiveVenues, getMarketplaceStats } from "@/features/venues";
import { formatPHP } from "@/lib/money";
import { getSessionUser } from "@/server/session";

// Counters and venue snapshot are dynamic — re-render every request so the
// numbers stay current without manual revalidation.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [user, stats, venues] = await Promise.all([
    getSessionUser(),
    getMarketplaceStats(),
    listActiveVenues({ limit: 6 }),
  ]);

  // Logged-in users land on their role-specific dashboard.
  if (user?.role === "player") redirect("/me");
  if (user?.role === "venue_owner") redirect("/owner");
  if (user?.role === "admin") redirect("/admin");

  return (
    <main className="flex flex-1 flex-col">
      <Hero />
      <StatsBar stats={stats} />
      <FeaturedVenues venues={venues} />
      <HowItWorks />
      <ForOwnersBand />
      <Features />
      <OpenPlayTeaser />
      <FaqSection />
    </main>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function Hero() {
  return (
    <section
      className="relative isolate overflow-hidden bg-[var(--color-bg)] px-4 pb-10 pt-8 sm:px-6 lg:px-8 lg:pb-16 lg:pt-12"
      aria-labelledby="hero-heading"
    >
      {/* Court-line pattern + brand glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[var(--color-bg-subtle)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[480px] bg-[radial-gradient(ellipse_60%_60%_at_50%_0%,var(--color-brand-100),transparent_70%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.06] [background-image:linear-gradient(var(--color-fg)_1px,transparent_1px),linear-gradient(90deg,var(--color-fg)_1px,transparent_1px)] [background-size:48px_48px]"
      />

      <Container className="text-center">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-[var(--color-border-default)] bg-[var(--color-bg)]/80 px-3 py-1 text-xs font-medium text-[var(--color-fg-muted)] shadow-[var(--shadow-sm)] backdrop-blur">
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-brand-500)] opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-[var(--color-brand-500)]" />
          </span>
          Now live in Agusan del Sur
        </div>

        <h1
          id="hero-heading"
          className="mx-auto mt-4 max-w-3xl text-balance text-3xl font-extrabold leading-[1.05] tracking-tight sm:text-4xl lg:text-5xl"
        >
          Your court is{" "}
          <span className="bg-gradient-to-r from-[var(--color-brand-500)] to-[var(--color-accent-500)] bg-clip-text text-transparent">
            waiting.
          </span>
        </h1>

        <p className="mx-auto mt-3 max-w-xl text-pretty text-base text-[var(--color-fg-muted)]">
          Find pickleball courts near you, see real availability, and pay
          through GCash. No calls, no chats — confirmation in your inbox.
        </p>

        <div className="mt-5 flex flex-col items-center justify-center gap-2 sm:flex-row">
          <Link
            href="/venues"
            className={`${buttonVariants({ size: "xl" })} w-full shadow-[var(--shadow-md)] sm:w-auto`}
          >
            <Search aria-hidden="true" />
            Find a court
          </Link>
          <Link
            href="/host"
            className={`${buttonVariants({ size: "xl", variant: "outline" })} w-full sm:w-auto`}
          >
            List your venue
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>

        <p className="mt-3 text-xs text-[var(--color-fg-subtle)]">
          Pay only what you see — no surprises, no hidden charges.
        </p>
      </Container>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Stats bar
// ---------------------------------------------------------------------------

function StatsBar({
  stats,
}: {
  stats: { venueCount: number; courtCount: number; bookingsLast7d: number };
}) {
  const items: ReadonlyArray<{ label: string; value: string }> = [
    { label: "Venues live", value: stats.venueCount.toLocaleString("en-PH") },
    { label: "Courts available", value: stats.courtCount.toLocaleString("en-PH") },
    {
      label: "Bookings this week",
      value: stats.bookingsLast7d.toLocaleString("en-PH"),
    },
    { label: "GCash payments accepted", value: "✓" },
  ];
  return (
    <section
      aria-label="Marketplace stats"
      className="border-y border-[var(--color-border-default)] bg-[var(--color-bg-muted)]"
    >
      <Container className="grid grid-cols-2 gap-y-4 py-5 sm:grid-cols-4">
        {items.map((s) => (
          <div key={s.label} className="text-center">
            <div className="text-2xl font-extrabold tracking-tight text-[var(--color-brand-600)] sm:text-3xl">
              {s.value}
            </div>
            <div className="mt-1 text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
              {s.label}
            </div>
          </div>
        ))}
      </Container>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Featured venues
// ---------------------------------------------------------------------------

interface FeaturedVenue {
  venue: {
    id: string;
    name: string;
    slug: string;
    city: string;
    province: string;
    coverImageUrl: string | null;
  };
  courtCount: number;
  minHourlyRateCentavos: bigint | null;
}

function FeaturedVenues({ venues }: { venues: FeaturedVenue[] }) {
  return (
    <section className="px-4 py-8 sm:px-6 lg:px-8 lg:py-12" aria-labelledby="venues-heading">
      <Container>
        <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-fg-muted)]">Featured</p>
            <h2 id="venues-heading" className="text-xl font-bold sm:text-2xl">
              Courts you can book today
            </h2>
            <p className="mt-2 text-[var(--color-fg-muted)]">
              {venues.length === 0
                ? "We're onboarding the first venues right now. Check back soon."
                : "Pick a venue and grab the next open slot."}
            </p>
          </div>
          {venues.length > 0 && (
            <Link
              href="/venues"
              className="inline-flex items-center gap-1 text-sm font-medium text-[var(--color-brand-600)] hover:underline"
            >
              See all venues <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          )}
        </div>

        {venues.length === 0 ? (
          <div className="mt-6 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] p-8 text-center">
            <Trophy
              className="mx-auto size-10 text-[var(--color-brand-500)]"
              aria-hidden="true"
            />
            <h3 className="mt-4 text-lg font-semibold">Be the first to list</h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-[var(--color-fg-muted)]">
              We&apos;re launching with venues across Agusan del Sur. List your
              court and start taking bookings this week.
            </p>
            <div className="mt-6">
              <Link
                href="/sign-up?role=venue_owner"
                className={buttonVariants({ size: "lg" })}
              >
                List your venue
              </Link>
            </div>
          </div>
        ) : (
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {venues.map((v) => (
              <li key={v.venue.id} className="min-w-0">
                <VenueCard item={v} />
              </li>
            ))}
          </ul>
        )}
      </Container>
    </section>
  );
}

function VenueCard({ item }: { item: FeaturedVenue }) {
  const { venue, courtCount, minHourlyRateCentavos } = item;
  return (
    <Link
      href={`/venues/${venue.slug}`}
      className="group block overflow-hidden rounded-[var(--radius-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)]"
    >
      <div
        className="relative aspect-[16/10] w-full overflow-hidden rounded-[var(--radius-md)] bg-gradient-to-br from-[var(--color-brand-300)] via-[var(--color-brand-500)] to-[var(--color-accent-500)] bg-cover bg-center"
        style={
          venue.coverImageUrl
            ? { backgroundImage: `url(${venue.coverImageUrl})` }
            : undefined
        }
        aria-hidden="true"
      >
        {!venue.coverImageUrl && (
          <div className="absolute inset-0 flex items-center justify-center text-white/90">
            <Trophy className="size-10" />
          </div>
        )}
        <div className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-[var(--color-bg)]/95 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-fg)]">
          <Zap className="size-3 text-[var(--color-brand-600)]" aria-hidden="true" />
          Bookable
        </div>
      </div>
      <div className="mt-2">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="truncate text-sm font-semibold leading-tight group-hover:text-[var(--color-brand-700)]">
            {venue.name}
          </h3>
          {minHourlyRateCentavos !== null ? (
            <span className="shrink-0 text-sm font-bold text-[var(--color-brand-700)]">
              {formatPHP(minHourlyRateCentavos)}
              <span className="ml-0.5 text-[10px] font-medium text-[var(--color-fg-muted)]">/hr</span>
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-[var(--color-fg-muted)]">
          <MapPin className="size-3" aria-hidden="true" />
          <span className="truncate">{venue.city}, {venue.province} · {courtCount} {courtCount === 1 ? "court" : "courts"}</span>
        </p>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// How it works
// ---------------------------------------------------------------------------

function HowItWorks() {
  const steps = [
    {
      n: 1,
      icon: <Search />,
      title: "Pick your court",
      body: "Browse verified venues and see which times are open. Pick a date, choose your hours, and book in seconds.",
    },
    {
      n: 2,
      icon: <CreditCard />,
      title: "Pay via GCash",
      body: "One GCash transfer to the venue. Upload the screenshot. The venue confirms — usually within minutes.",
    },
    {
      n: 3,
      icon: <CheckCircle2 />,
      title: "Show up & play",
      body: "Confirmation hits your inbox once the venue accepts. Slot held. Just bring your paddle.",
    },
  ];
  return (
    <section
      className="border-t border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] px-4 py-8 sm:px-6 lg:px-8 lg:py-12"
      aria-labelledby="how-heading"
    >
      <Container>
        <div className="text-center">
          <Badge variant="success" className="mb-2">
            How it works
          </Badge>
          <h2 id="how-heading" className="text-xl font-bold sm:text-2xl">
            From searching to serving — in three steps
          </h2>
        </div>
        <ol className="mt-6 grid gap-4 sm:grid-cols-3">
          {steps.map((s) => (
            <li
              key={s.n}
              className="relative rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg)] p-4"
            >
              <span className="absolute -top-2.5 left-4 inline-flex size-6 items-center justify-center rounded-full bg-[var(--color-brand-500)] text-xs font-bold text-white">
                {s.n}
              </span>
              <div className="mb-2 inline-flex size-8 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-brand-100)] text-[var(--color-brand-700)] [&_svg]:size-4">
                {s.icon}
              </div>
              <h3 className="text-base font-semibold">{s.title}</h3>
              <p className="mt-1 text-xs text-[var(--color-fg-muted)]">{s.body}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}

// ---------------------------------------------------------------------------
// For owners
// ---------------------------------------------------------------------------

function ForOwnersBand() {
  return (
    <section className="px-4 py-8 sm:px-6 lg:px-8 lg:py-10" aria-labelledby="owners-heading">
      <Container>
        <div className="relative overflow-hidden rounded-[var(--radius-lg)] bg-gradient-to-br from-[var(--color-brand-700)] via-[var(--color-brand-600)] to-[var(--color-accent-600)] p-6 text-white sm:p-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-15 [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:32px_32px]"
          />
          <div className="relative grid gap-6 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 id="owners-heading" className="text-xl font-bold sm:text-2xl">
                Run a court? Fill it.
              </h2>
              <p className="mt-2 max-w-md text-sm text-white/85">
                List your venue in 5 minutes. Take real bookings. Players find
                you, book a slot, and pay you directly via GCash. Free to list
                — no setup required.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href="/sign-up?role=venue_owner"
                  className={`${buttonVariants({ size: "lg" })} bg-white text-[var(--color-brand-700)] hover:bg-white/90`}
                >
                  List your venue
                </Link>
                <Link
                  href="/host"
                  className={`${buttonVariants({ size: "lg", variant: "ghost" })} text-white hover:bg-white/10`}
                >
                  Learn more <ArrowRight className="size-4" />
                </Link>
              </div>
            </div>
            <ul className="grid gap-3 text-sm">
              {[
                "Free to list — no setup cost, no subscription",
                "GCash direct to you — no middleman",
                "Verified players, verified receipts",
                "Calendar-aware double-booking protection",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-white" aria-hidden="true" />
                  <span className="text-white/90">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Container>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Coming-soon roadmap — communicates ambition + captures interest
// ---------------------------------------------------------------------------

function OpenPlayTeaser() {
  return (
    <section
      className="border-t border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] px-4 py-12 sm:px-6 lg:px-8 lg:py-16"
      aria-labelledby="roadmap-heading"
    >
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <Badge variant="info" className="mb-4">
            Roadmap
          </Badge>
          <h2
            id="roadmap-heading"
            className="text-balance text-2xl font-bold tracking-tight sm:text-3xl"
          >
            What&apos;s coming next
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-pretty text-sm text-[var(--color-fg-muted)] sm:text-base">
            We&apos;re just getting started. Here&apos;s what we&apos;re building so
            DinkHub becomes the home of pickleball in the Philippines.
          </p>
        </div>

        <ul
          role="list"
          className="mx-auto mt-8 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <RoadmapCard
            icon={<Users />}
            title="Open Play"
            description="Drop in to scheduled sessions at your local court. No group needed — just show up and meet other players."
          />
          <RoadmapCard
            icon={<Zap />}
            title="Game Management"
            description="In-app paddle queue, automatic court rotation, and live score keeping. Run your open play night without spreadsheets."
          />
          <RoadmapCard
            icon={<Trophy />}
            title="Tournaments"
            description="Bracket builder, online registration, and live results. From friendly round-robins to weekend opens."
          />
        </ul>

        <div className="mx-auto mt-10 max-w-md text-left">
          <p className="mb-3 text-center text-sm font-medium text-[var(--color-fg)]">
            Be first to know when these launch.
          </p>
          <OpenPlayTeaserForm />
        </div>
      </Container>
    </section>
  );
}

function RoadmapCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <li className="relative flex flex-col rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-bg)] p-5 shadow-[var(--shadow-sm)]">
      <div className="flex items-start justify-between gap-3">
        <div className="inline-flex size-10 items-center justify-center rounded-xl bg-[var(--color-brand-50)] text-[var(--color-brand-600)]">
          <span className="[&>svg]:size-5" aria-hidden="true">{icon}</span>
        </div>
        <Badge variant="info">Coming soon</Badge>
      </div>
      <h3 className="mt-4 text-base font-semibold text-[var(--color-fg)]">{title}</h3>
      <p className="mt-1 text-sm text-[var(--color-fg-muted)]">{description}</p>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------

function Features() {
  return (
    <section
      className="border-t border-[var(--color-border-default)] px-4 py-8 sm:px-6 lg:px-8 lg:py-12"
      aria-labelledby="features-heading"
    >
      <Container>
        <h2 id="features-heading" className="text-center text-xl font-bold sm:text-2xl">
          Built for the way you actually play
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FeatureCard
            icon={<MapPin />}
            title="Courts near you"
            description="Verified pickleball venues across Agusan del Sur, with more cities rolling out monthly."
          />
          <FeatureCard
            icon={<Calendar />}
            title="Real-time slots"
            description="See exactly which times are open today, this week, or next month — and grab one instantly."
          />
          <FeatureCard
            icon={<ShieldCheck />}
            title="Verified venues"
            description="Every venue is reviewed before listing. Bookings are confirmed by venue owners — usually within minutes."
          />
          <FeatureCard
            icon={<Users />}
            title="Find a partner"
            description="Coming soon — connect with players at your skill level near you."
          />
        </div>
      </Container>
    </section>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg)] p-4">
      <div className="mb-2 inline-flex size-8 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-brand-100)] text-[var(--color-brand-700)] [&_svg]:size-4">
        {icon}
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 text-xs text-[var(--color-fg-muted)]">{description}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FAQ
// ---------------------------------------------------------------------------

function FaqSection() {
  const faqs = [
    {
      q: "How do I pay for a booking?",
      a: "You'll see the venue's GCash details after picking a slot. Send one transfer for the full amount, upload the receipt, and the venue confirms within minutes.",
    },
    {
      q: "What does booking cost?",
      a: "You pay only the court rate set by the venue. The exact amount is always shown before you confirm — no surprises.",
    },
    {
      q: "Can I cancel?",
      a: "Yes, within 15 minutes of creating the booking. After that, contact the venue directly.",
    },
    {
      q: "Is my GCash receipt secure?",
      a: "Receipts are stored privately and only the venue owner can view them to verify your booking.",
    },
    {
      q: "When will you launch in my city?",
      a: "We're starting in Agusan del Sur and adding cities as we onboard venues. Want yours next? List your court.",
    },
  ];
  return (
    <section
      className="border-t border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] px-4 py-8 sm:px-6 lg:px-8 lg:py-12"
      aria-labelledby="faq-heading"
    >
      <Container className="max-w-3xl">
        <div className="text-center">
          <h2 id="faq-heading" className="text-xl font-bold sm:text-2xl">
            Frequently asked
          </h2>
        </div>
        <ul className="mt-6 divide-y divide-[var(--color-border-default)] border-y border-[var(--color-border-default)]">
          {faqs.map((f) => (
            <li key={f.q}>
              <details className="group py-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-sm font-semibold">
                  {f.q}
                  <span
                    aria-hidden="true"
                    className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-bg-muted)] text-[var(--color-fg-muted)] transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-2 text-sm text-[var(--color-fg-muted)]">{f.a}</p>
              </details>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

