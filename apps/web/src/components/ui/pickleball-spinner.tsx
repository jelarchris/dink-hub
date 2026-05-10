import { cn } from "@/lib/cn";

/**
 * Spinning pickleball loader. Pure CSS — no JS, no client bundle cost.
 * The ball is built from layered radial gradients so it works without
 * shipping an SVG asset.
 */
export function PickleballSpinner({
  size = 64,
  className,
  label = "Loading",
}: {
  size?: number;
  className?: string;
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className={cn("inline-flex flex-col items-center gap-3", className)}
    >
      <span
        className="block animate-spin rounded-full"
        style={{
          width: size,
          height: size,
          // Yellow-green pickleball with darker holes pattern.
          background: `
            radial-gradient(circle at 30% 30%, rgba(255,255,255,0.55) 0, rgba(255,255,255,0) 35%),
            radial-gradient(circle at 22% 50%, #b9c91a 0 5%, transparent 6%),
            radial-gradient(circle at 50% 22%, #b9c91a 0 5%, transparent 6%),
            radial-gradient(circle at 78% 50%, #b9c91a 0 5%, transparent 6%),
            radial-gradient(circle at 50% 78%, #b9c91a 0 5%, transparent 6%),
            radial-gradient(circle at 35% 35%, #b9c91a 0 4%, transparent 5%),
            radial-gradient(circle at 65% 35%, #b9c91a 0 4%, transparent 5%),
            radial-gradient(circle at 35% 65%, #b9c91a 0 4%, transparent 5%),
            radial-gradient(circle at 65% 65%, #b9c91a 0 4%, transparent 5%),
            radial-gradient(circle at 50% 50%, #e7f23b 0 60%, #d6e22a 100%)
          `,
          boxShadow: "inset -6px -8px 12px rgba(0,0,0,0.18), 0 4px 14px rgba(0,0,0,0.18)",
          animationDuration: "1.1s",
          animationTimingFunction: "linear",
        }}
      />
      <span className="text-sm text-[var(--color-fg-muted)]">{label}…</span>
    </div>
  );
}

/**
 * Full-area centered spinner — drop into Next.js loading.tsx files.
 */
export function PageSpinner({ label }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center">
      <PickleballSpinner label={label ?? "Loading"} />
    </div>
  );
}
