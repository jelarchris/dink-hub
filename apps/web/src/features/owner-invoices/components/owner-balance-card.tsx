import Link from "next/link";
import { ArrowUpRight, CheckCircle2, Clock, TriangleAlert, XCircle } from "lucide-react";
import { findOutstandingInvoiceForOwner } from "@/features/owner-invoices";
import { formatPHP } from "@/lib/money";
import { cn } from "@/lib/cn";

const DATE_FMT = new Intl.DateTimeFormat("en-PH", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "Asia/Manila",
});

function formatDueDate(value: string | Date): string {
  // `due_date` is a DATE column; Drizzle returns it as YYYY-MM-DD string.
  const d = typeof value === "string" ? new Date(`${value}T00:00:00+08:00`) : value;
  return DATE_FMT.format(d);
}

function daysUntil(date: string | Date): number {
  const target = typeof date === "string" ? new Date(`${date}T00:00:00+08:00`) : date;
  const diff = target.getTime() - Date.now();
  return Math.ceil(diff / 86_400_000);
}

interface ShellProps {
  tone: "due" | "submitted" | "rejected" | "clear";
  icon: React.ReactNode;
  kicker: string;
  headline: React.ReactNode;
  body?: React.ReactNode;
  cta?: { href: string; label: string } | undefined;
}

function Shell({ tone, icon, kicker, headline, body, cta }: ShellProps) {
  const toneClass = {
    due: "bg-orange-50 text-orange-950 border-orange-200 dark:bg-orange-950/30 dark:text-orange-50 dark:border-orange-900",
    submitted: "bg-sky-50 text-sky-950 border-sky-200 dark:bg-sky-950/30 dark:text-sky-50 dark:border-sky-900",
    rejected: "bg-red-50 text-red-950 border-red-200 dark:bg-red-950/30 dark:text-red-50 dark:border-red-900",
    clear:
      "bg-[var(--color-bg)] text-[var(--color-fg)] border-[var(--color-border-default)]",
  }[tone];

  const iconBg = {
    due: "bg-white/70 text-orange-700 dark:bg-orange-900/40 dark:text-orange-200",
    submitted: "bg-white/70 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200",
    rejected: "bg-white/70 text-red-700 dark:bg-red-900/40 dark:text-red-200",
    clear: "bg-[var(--color-brand-100)] text-[var(--color-brand-700)]",
  }[tone];

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-[var(--radius-lg)] border p-4 sm:p-5 shadow-[var(--shadow-sm)]",
        toneClass,
      )}
    >
      <div className="flex items-start gap-3 sm:gap-4">
        <span
          aria-hidden
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-md)]",
            iconBg,
          )}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{kicker}</p>
          <div className="mt-0.5 text-base font-semibold leading-snug sm:text-lg">{headline}</div>
          {body && <div className="mt-1 text-sm opacity-90">{body}</div>}
        </div>
        {cta && (
          <Link
            href={cta.href}
            className={cn(
              "ml-auto hidden shrink-0 items-center gap-1 self-center rounded-[var(--radius-md)] px-3 py-2 text-sm font-semibold transition-colors sm:inline-flex",
              tone === "due"
                ? "bg-orange-600 text-white hover:bg-orange-700"
                : tone === "rejected"
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-[var(--color-brand-600)] text-white hover:bg-[var(--color-brand-700)]",
            )}
          >
            {cta.label} <ArrowUpRight className="size-4" />
          </Link>
        )}
      </div>
      {cta && (
        <Link
          href={cta.href}
          className={cn(
            "mt-3 inline-flex w-full items-center justify-center gap-1 rounded-[var(--radius-md)] px-3 py-2 text-sm font-semibold transition-colors sm:hidden",
            tone === "due"
              ? "bg-orange-600 text-white hover:bg-orange-700"
              : tone === "rejected"
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-[var(--color-brand-600)] text-white hover:bg-[var(--color-brand-700)]",
          )}
        >
          {cta.label} <ArrowUpRight className="size-4" />
        </Link>
      )}
    </section>
  );
}

export async function OwnerBalanceCard({ ownerId }: { ownerId: string }) {
  const outstanding = await findOutstandingInvoiceForOwner(ownerId);

  if (outstanding) {
    const { invoice } = outstanding;
    const amount = formatPHP(invoice.totalCentavos);

    if (invoice.status === "rejected") {
      return (
        <Shell
          tone="rejected"
          icon={<XCircle className="size-5" />}
          kicker="DinkHub balance"
          headline={<>Receipt rejected — re-upload {amount}</>}
          body={invoice.rejectionReason ?? "Please upload a clearer GCash receipt."}
          cta={{ href: `/owner/invoices/${invoice.id}`, label: "Resubmit" }}
        />
      );
    }
    if (invoice.status === "submitted") {
      return (
        <Shell
          tone="submitted"
          icon={<Clock className="size-5" />}
          kicker="DinkHub balance"
          headline={<>{amount} awaiting verification</>}
          body={`Submitted${invoice.submittedAt ? ` ${DATE_FMT.format(invoice.submittedAt)}` : ""}. We'll email you when it's verified — usually within 1 business day.`}
          cta={{ href: `/owner/invoices/${invoice.id}`, label: "View" }}
        />
      );
    }
    // open
    const days = daysUntil(invoice.dueDate);
    const dueLabel =
      days < 0
        ? `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}`
        : days === 0
          ? "Due today"
          : `Due in ${days} day${days === 1 ? "" : "s"}`;
    return (
      <Shell
        tone="due"
        icon={<TriangleAlert className="size-5" />}
        kicker="DinkHub balance"
        headline={
          <>
            You owe <span className="tabular-nums">{amount}</span>
          </>
        }
        body={
          <span>
            <span className="font-semibold">{dueLabel}</span> · {formatDueDate(invoice.dueDate)} ·{" "}
            {invoice.bookingCount} booking{invoice.bookingCount === 1 ? "" : "s"}
          </span>
        }
        cta={{ href: `/owner/invoices/${invoice.id}`, label: "Pay invoice" }}
      />
    );
  }

  return (
    <Shell
      tone="clear"
      icon={<CheckCircle2 className="size-5" />}
      kicker="DinkHub balance"
      headline="All caught up"
      body="No outstanding booking-fee invoices for your venues."
    />
  );
}
