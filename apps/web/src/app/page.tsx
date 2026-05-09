import { Calendar, MapPin, ShieldCheck, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden bg-[var(--color-bg-subtle)] px-4 pb-20 pt-16 sm:px-6 lg:px-8 lg:pb-32 lg:pt-24">
        <div className="mx-auto max-w-5xl text-center">
          <Badge variant="success" className="mb-6">
            <span className="size-1.5 rounded-full bg-[var(--color-brand-500)]" />
            Now launching in Agusan del Sur
          </Badge>
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
            Book your next pickleball game.{" "}
            <span className="text-[var(--color-brand-600)]">In seconds.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-[var(--color-fg-muted)]">
            Find courts near you, see real-time availability, pay via GCash, and get
            instant confirmation. No phone calls, no hassle.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="xl" className="w-full sm:w-auto">
              Find a court
            </Button>
            <Button size="xl" variant="outline" className="w-full sm:w-auto">
              List your venue
            </Button>
          </div>
          <p className="mt-4 text-sm text-[var(--color-fg-subtle)]">
            Free for players · Venue owners pay only when you book
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-[var(--color-border-default)] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">
            Everything you need to play
          </h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <FeatureCard
              icon={<MapPin />}
              title="Courts near you"
              description="Browse verified pickleball venues across Agusan del Sur."
            />
            <FeatureCard
              icon={<Calendar />}
              title="Real-time slots"
              description="See exactly which 30-minute slots are open today, this week, or next month."
            />
            <FeatureCard
              icon={<ShieldCheck />}
              title="Verified venues"
              description="Every venue is verified before listing. GCash receipts checked by venue owner."
            />
            <FeatureCard
              icon={<Users />}
              title="Find a partner"
              description="Coming soon — connect with players at your skill level."
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-[var(--color-border-default)] px-4 py-8 text-center text-sm text-[var(--color-fg-subtle)] sm:px-6 lg:px-8">
        <p>© {new Date().getFullYear()} DinkHub · Made in Agusan del Sur 🇵🇭</p>
      </footer>
    </main>
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
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)] p-6 shadow-[var(--shadow-sm)]">
      <div className="mb-4 inline-flex size-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-brand-100)] text-[var(--color-brand-700)] [&_svg]:size-5">
        {icon}
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-[var(--color-fg-muted)]">{description}</p>
    </div>
  );
}
