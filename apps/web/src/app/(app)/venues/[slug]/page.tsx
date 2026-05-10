import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, MapPin, Phone, Trophy, Wifi, ParkingCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { findActiveVenueBySlug } from "@/features/venues";
import { venueMediaPublicUrl } from "@/lib/venue-media";
import { formatPHP } from "@/lib/money";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await findActiveVenueBySlug(slug);
  return {
    title: found ? found.venue.name : "Venue not found",
    description: found?.venue.description ?? undefined,
  };
}

export default async function VenuePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const found = await findActiveVenueBySlug(slug);
  if (!found) notFound();
  const { venue, courts } = found;

  const minRate = courts.reduce<bigint | null>((acc, c) => {
    const r = c.hourlyRateCentavos;
    return acc === null || r < acc ? r : acc;
  }, null);

  return (
    <Container className="py-6 sm:py-8">
      <Link
        href="/venues"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
      >
        <ArrowLeft className="size-4" /> All venues
      </Link>

      <div className="relative h-52 w-full overflow-hidden rounded-[var(--radius-lg)] bg-gradient-to-br from-[var(--color-brand-300)] via-[var(--color-brand-500)] to-[var(--color-accent-500)] sm:h-72">
        {venue.coverImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={venue.coverImageUrl} alt={venue.name} className="h-full w-full object-cover" />
        )}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-4 left-4 right-4 text-white">
          <Badge variant="success" className="mb-2">Open for bookings</Badge>
          <h1 className="text-2xl font-bold leading-tight drop-shadow sm:text-4xl">{venue.name}</h1>
          <p className="mt-1 inline-flex items-center gap-1 text-sm drop-shadow">
            <MapPin className="size-4" />
            {venue.city}, {venue.province}
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <CardContent className="grid grid-cols-3 gap-4 py-5 text-center">
              <Fact label="Courts" value={String(courts.length)} />
              <Fact
                label="From"
                value={minRate !== null ? formatPHP(minRate) : "—"}
                {...(minRate !== null ? { suffix: "/hr" } : {})}
              />
              <Fact label="Address" value={venue.addressLine} small />
            </CardContent>
          </Card>

          {venue.description && (
            <Card>
              <CardHeader><CardTitle>About this venue</CardTitle></CardHeader>
              <CardContent className="whitespace-pre-line text-[var(--color-fg)]">
                {venue.description}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Courts ({courts.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {courts.length === 0 ? (
                <p className="text-sm text-[var(--color-fg-muted)]">No active courts yet.</p>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {courts.map((c) => {
                    const img = venueMediaPublicUrl(c.imagePath);
                    return (
                      <li
                        key={c.id}
                        className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg)]"
                      >
                        <div className="relative aspect-[4/3] w-full bg-gradient-to-br from-[var(--color-brand-300)] to-[var(--color-brand-600)]">
                          {img ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={img} alt={c.name} className="h-full w-full object-cover" />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-white/85">
                              <Trophy className="size-8" />
                            </div>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2 p-3">
                          <div>
                            <div className="font-semibold leading-tight">{c.name}</div>
                            <div className="text-xs text-[var(--color-fg-muted)]">
                              {c.isIndoor ? "Indoor" : "Outdoor"} · {c.surface}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-bold">{formatPHP(c.hourlyRateCentavos)}</div>
                            <div className="text-[10px] uppercase tracking-wide text-[var(--color-fg-muted)]">per hour</div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardContent className="space-y-4 py-5">
              <div>
                <div className="text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
                  Hourly rate from
                </div>
                <div className="text-3xl font-extrabold text-[var(--color-brand-700)]">
                  {minRate !== null ? formatPHP(minRate) : "—"}
                  <span className="ml-1 text-sm font-medium text-[var(--color-fg-muted)]">/ hr</span>
                </div>
              </div>
              {courts.length > 0 ? (
                <Link
                  href={`/venues/${venue.slug}/book`}
                  className={`${buttonVariants({ size: "lg" })} w-full justify-center`}
                >
                  Book a court <ArrowRight className="size-4" />
                </Link>
              ) : (
                <button
                  type="button"
                  disabled
                  className={`${buttonVariants({ size: "lg" })} w-full cursor-not-allowed justify-center opacity-50`}
                >
                  No courts available
                </button>
              )}
              <ul className="space-y-1.5 text-xs text-[var(--color-fg-muted)]">
                <li className="flex items-center gap-2"><Wifi className="size-3.5" /> Real-time availability</li>
                <li className="flex items-center gap-2"><ParkingCircle className="size-3.5" /> GCash payment</li>
                <li className="flex items-center gap-2"><Phone className="size-3.5" /> 15-min cancellation window</li>
              </ul>
            </CardContent>
          </Card>
        </aside>
      </div>
    </Container>
  );
}

function Fact({
  label,
  value,
  suffix,
  small,
}: {
  label: string;
  value: string;
  suffix?: string;
  small?: boolean;
}) {
  return (
    <div>
      <div
        className={
          small ? "line-clamp-2 text-sm font-semibold" : "text-2xl font-extrabold tracking-tight"
        }
      >
        {value}
        {suffix && (
          <span className="ml-1 text-sm font-medium text-[var(--color-fg-muted)]">{suffix}</span>
        )}
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-wide text-[var(--color-fg-muted)]">{label}</div>
    </div>
  );
}
