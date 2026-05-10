import { redirect } from "next/navigation";
import { ArrowLeft, Inbox } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { EmptyState } from "@/components/ui/empty-state";
import { getSessionUser } from "@/server/session";
import { listPendingPaymentsForOwner } from "@/features/bookings-view";
import { getReceiptSignedUrl } from "@/features/storage";
import { PaymentReviewCard } from "./review-card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Verify payments" };

export default async function OwnerPaymentsPage() {
  const profile = await getSessionUser();
  if (!profile) redirect(`/sign-in?next=${encodeURIComponent("/owner/payments")}`);
  if (profile.role !== "venue_owner" && profile.role !== "admin") {
    redirect("/owner");
  }

  const pending = await listPendingPaymentsForOwner(profile.id);
  // Pre-sign all receipt URLs in parallel (5-min TTL). Authorized by upstream query
  // (only payments belonging to venues this owner controls).
  const withUrls = await Promise.all(
    pending.map(async (p) => ({
      ...p,
      receiptUrl: await getReceiptSignedUrl(p.payment.receiptImagePath, 300),
    })),
  );

  return (
    <Container className="max-w-3xl py-8">
      <Link
        href="/owner"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
      >
        <ArrowLeft className="size-4" /> Dashboard
      </Link>

      <h1 className="text-2xl font-bold tracking-tight">Payment verification</h1>
      <p className="mt-1 text-[var(--color-fg-muted)]">
        Approve receipts to confirm bookings. Reject if the amount or reference doesn&apos;t match.
      </p>

      <div className="mt-6 space-y-4">
        {withUrls.length === 0 ? (
          <EmptyState
            icon={<Inbox />}
            title="All caught up"
            description="No payments awaiting verification right now."
          />
        ) : (
          withUrls.map((row) => (
            <PaymentReviewCard
              key={row.payment.id}
              paymentId={row.payment.id}
              amountCentavosStr={row.payment.amountCentavos.toString()}
              expectedTotalCentavosStr={row.booking.totalCentavos.toString()}
              gcashReferenceNumber={row.payment.gcashReferenceNumber}
              submittedAtIso={row.payment.submittedAt.toISOString()}
              startAtIso={row.booking.startAt.toISOString()}
              endAtIso={row.booking.endAt.toISOString()}
              venueName={row.venue.name}
              courtName={row.court.name}
              playerName={row.playerDisplayName}
              receiptUrl={row.receiptUrl}
            />
          ))
        )}
      </div>
    </Container>
  );
}
