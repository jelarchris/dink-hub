import { cn } from "@/lib/cn";

interface StarRatingProps {
  rating: number; // 1–5, may be fractional for display
  maxStars?: number;
  className?: string;
  /** Size of each star. Defaults to 4 (1rem). */
  size?: number;
}

/**
 * Read-only star display. Supports fractional fill via SVG clip-path so
 * avg_rating (e.g. 4.3) renders a partial last star.
 */
export function StarRating({ rating, maxStars = 5, className, size = 4 }: StarRatingProps) {
  const clipped = Math.max(0, Math.min(rating, maxStars));
  const sizePx = size * 4; // Tailwind size unit → px (1 unit = 4px)
  return (
    <span
      className={cn("inline-flex items-center gap-0.5", className)}
      aria-label={`${clipped.toFixed(1)} out of ${maxStars} stars`}
      role="img"
    >
      {Array.from({ length: maxStars }, (_, i) => {
        const fill = Math.max(0, Math.min(1, clipped - i));
        const pct = Math.round(fill * 100);
        const uid = `star-${i}-${Math.round(clipped * 10)}`;
        return (
          <svg
            key={i}
            width={sizePx}
            height={sizePx}
            viewBox="0 0 20 20"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id={uid} x1="0" x2="1" y1="0" y2="0">
                <stop offset={`${pct}%`} stopColor="var(--color-warning, #f59e0b)" />
                <stop offset={`${pct}%`} stopColor="var(--color-border-default, #e5e7eb)" />
              </linearGradient>
            </defs>
            <polygon
              points="10,1 12.9,7 19.5,7.6 14.5,12 16.2,18.5 10,15 3.8,18.5 5.5,12 0.5,7.6 7.1,7"
              fill={`url(#${uid})`}
            />
          </svg>
        );
      })}
    </span>
  );
}
