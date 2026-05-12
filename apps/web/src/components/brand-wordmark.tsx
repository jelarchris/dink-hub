import { cn } from "@/lib/cn";

/**
 * DinkHub wordmark with a pickleball ball replacing the dot of the "i" in
 * "Dink". Uses a dotless ı (U+0131) and absolutely positions an SVG ball
 * above it so the dot inherits brand color, never the font's default dot.
 *
 * Sized via the className prop (controls font-size/leading); the ball scales
 * relative to the current font-size using em units so it always lines up.
 */
export function BrandWordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center font-bold tracking-tight leading-none",
        className,
      )}
    >
      <span className="text-[var(--color-brand-600)]">
        D
        <span className="relative inline-block">
          {/* Dotless i so the font's own dot doesn't show through. */}
          {"\u0131"}
          <PickleballDot />
        </span>
        nk
      </span>
      <span className="text-[var(--color-accent-600)]">Hub</span>
    </span>
  );
}

function PickleballDot() {
  // Sized in em so it tracks the surrounding font-size.
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="pointer-events-none absolute left-1/2 -translate-x-1/2"
      style={{
        width: "0.55em",
        height: "0.55em",
        // Sits where the dot of an "i" would be, just above the stem.
        top: "-0.4em",
      }}
    >
      <circle cx="10" cy="10" r="9" fill="#d4ff3a" stroke="#a3cf1a" strokeWidth="1" />
      {/* Pickleball holes */}
      <circle cx="6" cy="7" r="1.2" fill="#a3cf1a" />
      <circle cx="10.5" cy="6" r="1.2" fill="#a3cf1a" />
      <circle cx="14" cy="8.5" r="1.2" fill="#a3cf1a" />
      <circle cx="6.5" cy="11.5" r="1.2" fill="#a3cf1a" />
      <circle cx="10" cy="13" r="1.2" fill="#a3cf1a" />
      <circle cx="13.5" cy="12.5" r="1.2" fill="#a3cf1a" />
    </svg>
  );
}
