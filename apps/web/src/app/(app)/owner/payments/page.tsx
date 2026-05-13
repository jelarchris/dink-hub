import { redirect } from "next/navigation";
import { Inbox } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { Container } from "@/components/ui/container";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
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
  const withUrls = await Promise.all(
    pending.map(async (p) => ({
      ...p,
      receiptUrl: await getReceiptSignedUrl(p.payment.receiptImagePath, 300),
    })),
  );

  return (
    <Container className="max-w-3xl py-3 sm:py-4">
      <AutoRefresh intervalMs={10_000} />
      <PageHeader
        back={{ href: "/owner", label: "Owner" }}
        kicker="Verify payments"
        title={`${withUrls.length} pending`}
        subtitle="Approve receipts to confirm bookings"
      />

      <div className="space-y-3">
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
