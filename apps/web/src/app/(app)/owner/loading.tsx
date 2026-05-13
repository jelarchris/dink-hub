export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-3 py-3 sm:px-4 sm:py-4 lg:px-6">
      <div className="mb-3 border-b border-[var(--color-border-default)] pb-3">
        <div className="mb-2 flex justify-end">
          <div className="h-3 w-14 rounded-full bg-[var(--color-bg-muted)]" />
        </div>
        <div className="h-7 w-32 rounded-[var(--radius-md)] bg-[var(--color-bg-muted)]" />
        <div className="mt-2 h-4 w-44 rounded-[var(--radius-md)] bg-[var(--color-bg-muted)]" />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.15fr_0.85fr]">
        <DashboardSkeletonBlock className="h-52" />
        <DashboardSkeletonBlock className="h-52" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <DashboardSkeletonBlock key={index} className="h-32" />
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <DashboardSkeletonBlock className="h-80" />
        <div className="space-y-4">
          <DashboardSkeletonBlock className="h-28" />
          <DashboardSkeletonBlock className="h-52" />
        </div>
      </div>
    </main>
  );
}

function DashboardSkeletonBlock({ className }: { className: string }) {
  return (
    <div
      className={`animate-pulse rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)] shadow-[var(--shadow-sm)] ${className}`}
    />
  );
}
