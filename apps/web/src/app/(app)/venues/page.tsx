import Link from "next/link";
import { ArrowDownAZ, ArrowDownNarrowWide, MapPin, Search, Star, Trophy, X } from "lucide-react";
import { Container } from "@/components/ui/container";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StarRating } from "@/components/ui/star-rating";
import {
  getVenueAvailabilityMap,
  listActiveVenueCities,
  listActiveVenues,
  type AvailabilityFilter,
  type VenueAvailability,
  type VenueSort,
} from "@/features/venues";
import {
  formatManilaDate,
  todToRange,
  TIME_SLIDER_MIN,
  TIME_SLIDER_MAX,
  type TimeOfDay,
} from "@/features/venues/availability";
import { formatPHP } from "@/lib/money";
import { cn } from "@/lib/cn";
import { AvailabilityFilterBar } from "./availability-filter";

export const dynamic = "force-dynamic";
export const metadata = { title: "Find a court" };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const SORT_OPTIONS: ReadonlyArray<{ value: VenueSort; label: string; icon: typeof ArrowDownAZ }> = [
  { value: "name", label: "Name", icon: ArrowDownAZ },
  { value: "price_asc", label: "Price", icon: ArrowDownNarrowWide },
  { value: "rating_desc", label: "Top rated", icon: Star },
];

function pickString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

interface FilterState {
  q?: string | undefined;
  city?: string | undefined;
  sort?: VenueSort | undefined;
  // Availability filter params (preserved across city/sort navigation)
  date?: string | undefined;
  sh?: string | undefined;
  eh?: string | undefined;
  dur?: string | undefined;
}

function buildQuery(current: FilterState, patch: FilterState): string {
  const next = { ...current, ...patch };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.city) params.set("city", next.city);
  if (next.sort && next.sort !== "name") params.set("sort", next.sort);
  if (next.date) params.set("date", next.date);
  if (next.sh) params.set("sh", next.sh);
  if (next.eh) params.set("eh", next.eh);
  if (next.dur) params.set("dur", next.dur);
  const qs = params.toString();
  return qs ? `/venues?${qs}` : "/venues";
}

/** Validates and parses availability URL params. Returns null if absent or invalid.
 *  Accepts new `?sh=&eh=` params; falls back to legacy `?tod=` for backward compat. */
function resolveAvailabilityFilter(
  sp: Record<string, string | string[] | undefined>,
): AvailabilityFilter | null {
  const date = pickString(sp.date);
  const durStr = pickString(sp.dur);
  if (!date || !durStr) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const dur = parseInt(durStr, 10);
  if (dur !== 30 && dur !== 60 && dur !== 90 && dur !== 120) return null;

  // Prefer new sh/eh params; fall back to legacy tod param.
  const shStr = pickString(sp.sh);
  const ehStr = pickString(sp.eh);
  const tod = pickString(sp.tod);

  let startH: number;
  let endH: number;

  if (shStr !== undefined && ehStr !== undefined) {
    startH = parseInt(shStr, 10);
    endH = parseInt(ehStr, 10);
    if (
      !Number.isInteger(startH) || !Number.isInteger(endH) ||
      startH < TIME_SLIDER_MIN || endH > TIME_SLIDER_MAX ||
      endH <= startH
    ) return null;
  } else if (tod) {
    const VALID_TODS = ["morning", "afternoon", "evening", "late_night"] as const;
    if (!VALID_TODS.includes(tod as (typeof VALID_TODS)[number])) return null;
    ({ startH, endH } = todToRange(tod as TimeOfDay));
  } else {
    // No time params — not an active filter
    return null;
  }

  return { date, startH, endH, durationMin: dur };
}

export default async function VenuesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const q = pickString(sp.q)?.trim() || undefined;
  const city = pickString(sp.city)?.trim() || undefined;
  const sortRaw = pickString(sp.sort);
  const sort: VenueSort =
    sortRaw === "price_asc" || sortRaw === "rating_desc" ? sortRaw : "name";
  const availability = resolveAvailabilityFilter(sp);

  // Compute today in Manila timezone server-side to avoid hydration mismatch
  // in the client AvailabilityFilterBar component.
  const manilaToday = formatManilaDate(new Date());

  const [venueList, cities] = await Promise.all([
    listActiveVenues({
      limit: 50,
      ...(q ? { query: q } : {}),
      ...(city ? { city } : {}),
      sort,
    }),
    listActiveVenueCities(),
  ]);

  // Second round-trip only when availability filter is active.
  const availabilityMap =
    availability && venueList.length > 0
      ? await getVenueAvailabilityMap(
          venueList.map((v) => v.venue.id),
          availability,
        )
      : null;

  const current: FilterState = {
    q,
    city,
    sort,
    ...(availability
      ? {
          date: availability.date,
          sh: String(availability.startH),
          eh: String(availability.endH),
          dur: String(availability.durationMin),
        }
      : {}),
  };
  const hasActiveFilter =
    Boolean(q) || Boolean(city) || sort !== "name" || availability !== null;

  return (
    <>
      {/* ── Sticky filter bar ── */}
      <div className="sticky top-14 z-30 border-b border-[var(--color-border-default)] bg-[var(--color-bg)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--color-bg)]/80">
        <Container className="py-3 sm:py-4">
          {/* Search */}
          <form action="/venues" method="GET" className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-fg-subtle)]"
            />
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search venues by name…"
              aria-label="Search venues"
              className="h-11 w-full rounded-full border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] pl-10 pr-10 text-sm font-medium text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus-visible:border-[var(--color-brand-500)] focus-visible:bg-[var(--color-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)]/20"
            />
            {/* Preserve city + sort across search submit */}
            {city && <input type="hidden" name="city" value={city} />}
            {sort !== "name" && <input type="hidden" name="sort" value={sort} />}
            {q && (
              <Link
                href={buildQuery(current, { q: undefined })}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-[var(--color-fg-subtle)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-fg)]"
              >
                <X className="size-4" />
              </Link>
            )}
          </form>

          {/* City chips — horizontally scrollable on mobile */}
          {cities.length > 0 && (
            <div className="-mx-4 mt-3 sm:mx-0">
              <div className="flex gap-2 overflow-x-auto px-4 pb-1 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
                <CityChip
                  label="All"
                  href={buildQuery(current, { city: undefined })}
                  active={!city}
                />
                {cities.map((c) => (
                  <CityChip
                    key={c.city}
                    label={c.city}
                    count={c.venueCount}
                    href={buildQuery(current, { city: c.city })}
                    active={city === c.city}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Sort row */}
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-[var(--color-fg-muted)]">
              <span className="font-bold text-[var(--color-fg)]">{venueList.length}</span>{" "}
              {venueList.length === 1 ? "venue" : "venues"}
              {city && <> in {city}</>}
              {q && <> matching &ldquo;{q}&rdquo;</>}
            </p>
            <div className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-bg-subtle)] p-0.5">
              {SORT_OPTIONS.map((opt) => {
                const active = sort === opt.value;
                const Icon = opt.icon;
                return (
                  <Link
                    key={opt.value}
                    href={buildQuery(current, { sort: opt.value })}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium transition active:scale-95",
                      active
                        ? "bg-[var(--color-bg)] text-[var(--color-fg)] shadow-[var(--shadow-sm)]"
                        : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]",
                    )}
                    aria-pressed={active}
                  >
                    <Icon className="size-3.5" aria-hidden="true" />
                    <span className="hidden sm:inline">{opt.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Availability filter — client component to avoid hydration issues with dates */}
          <AvailabilityFilterBar
            today={manilaToday}
            activeFilter={availability}
            {...(q ? { currentQ: q } : {})}
            {...(city ? { currentCity: city } : {})}
            {...(sort !== "name" ? { currentSort: sort } : {})}
          />
        </Container>
      </div>

      <Container className="py-4 sm:py-6">
        <PageHeader
          kicker="Find a court"
          title={city ? `Venues in ${city}` : "Venues near you"}
          {...(cities.length > 0
            ? {
                subtitle: `${cities.reduce((acc, c) => acc + c.venueCount, 0)} active across ${cities.length} ${cities.length === 1 ? "city" : "cities"}`,
              }
            : {})}
        />

        {venueList.length === 0 ? (
          <EmptyState
            icon={hasActiveFilter ? <Search /> : <Trophy />}
            title={
              availability
                ? "No venues available"
                : hasActiveFilter
                  ? "No matches"
                  : "No venues yet"
            }
            description={
              availability
                ? "No courts with a free slot for that time. Try a different time or date."
                : hasActiveFilter
                  ? "Try a different search or clear your filters."
                  : "We're just getting started. Check back soon — or list your venue and be among the first."
            }
            action={
              hasActiveFilter ? (
                <Link
                  href="/venues"
                  className="text-sm font-semibold text-[var(--color-brand-700)] hover:underline"
                >
                  Clear all filters
                </Link>
              ) : null
            }
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {venueList.map((v) => {
              const avail: VenueAvailability | undefined = availabilityMap?.get(v.venue.id);
              const fullyBooked = avail !== undefined && avail.availableCourts === 0;
              return (
              <li key={v.venue.id} className="min-w-0">
                <Link
                  href={`/venues/${v.venue.slug}`}
                  className="group block overflow-hidden rounded-[var(--radius-lg)] transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)] focus-visible:ring-offset-2"
                >
                  <div
                    className={cn(
                      "relative aspect-[16/10] w-full overflow-hidden rounded-[var(--radius-lg)] bg-gradient-to-br from-[var(--color-brand-300)] to-[var(--color-brand-600)] transition-opacity",
                      fullyBooked && "opacity-50",
                    )}
                  >
                    {v.venue.coverImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={v.venue.coverImageUrl}
                        alt={v.venue.name}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-white/85">
                        <Trophy className="size-10" aria-hidden="true" />
                      </div>
                    )}
                    {/* Court count / availability badge */}
                    {avail !== undefined ? (
                      <span
                        className={cn(
                          "absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold shadow-[var(--shadow-sm)]",
                          avail.availableCourts === 0
                            ? "bg-red-100 text-red-700"
                            : avail.availableCourts < avail.totalCourts
                              ? "bg-amber-100 text-amber-700"
                              : "bg-emerald-100 text-emerald-700",
                        )}
                      >
                        {avail.availableCourts === 0
                          ? "Fully booked"
                          : `${avail.availableCourts} of ${avail.totalCourts} free`}
                      </span>
                    ) : (
                      <span className="absolute right-2 top-2 rounded-full bg-[var(--color-bg)]/95 px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--color-fg)] shadow-[var(--shadow-sm)]">
                        {v.courtCount} {v.courtCount === 1 ? "court" : "courts"}
                      </span>
                    )}
                    {v.avgRating !== null && (
                      <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-[var(--color-bg)]/95 px-2 py-0.5 text-[10px] font-bold text-[var(--color-fg)] shadow-[var(--shadow-sm)]">
                        <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden="true" />
                        {v.avgRating.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <div className="mt-2.5 px-0.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <h2 className="truncate text-sm font-semibold leading-tight group-hover:text-[var(--color-brand-700)] sm:text-base">
                        {v.venue.name}
                      </h2>
                      {v.minHourlyRateCentavos !== null && (
                        <span className="shrink-0 text-sm font-bold text-[var(--color-brand-700)]">
                          {formatPHP(v.minHourlyRateCentavos)}
                          <span className="ml-0.5 text-[10px] font-medium text-[var(--color-fg-muted)]">
                            /hr
                          </span>
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-[var(--color-fg-muted)]">
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <MapPin className="size-3 shrink-0" aria-hidden="true" />
                        <span className="truncate">
                          {v.venue.city}, {v.venue.province}
                        </span>
                      </span>
                      {v.reviewCount > 0 && v.avgRating !== null && (
                        <span className="inline-flex shrink-0 items-center gap-1">
                          <StarRating rating={v.avgRating} size={3} />
                          <span>({v.reviewCount})</span>
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
              );
            })}
          </ul>
        )}
      </Container>
    </>
  );
}

function CityChip({
  label,
  href,
  active,
  count,
}: {
  label: string;
  href: string;
  active: boolean;
  count?: number;
}) {
  return (
    <Link
      href={href}
      aria-pressed={active}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium transition active:scale-95",
        active
          ? "border-[var(--color-brand-500)] bg-[var(--color-brand-500)] text-white"
          : "border-[var(--color-border-default)] bg-[var(--color-bg)] text-[var(--color-fg-muted)] hover:border-[var(--color-brand-300)] hover:text-[var(--color-fg)]",
      )}
    >
      {label}
      {count !== undefined && (
        <span
          className={cn(
            "inline-flex min-w-[1.25rem] justify-center rounded-full px-1 text-[10px] font-bold",
            active
              ? "bg-white/20 text-white"
              : "bg-[var(--color-bg-subtle)] text-[var(--color-fg-subtle)]",
          )}
        >
          {count}
        </span>
      )}
    </Link>
  );
}
