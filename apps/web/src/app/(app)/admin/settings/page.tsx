import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { getSystemSettings } from "@/features/system-settings";
import { venueMediaPublicUrl } from "@/lib/venue-media";
import { formatPHP } from "@/lib/money";
import { formatDateTimeManila } from "@/lib/date";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Platform settings" };

export default async function AdminSettingsPage() {
  const settings = await getSystemSettings();
  const qrUrl = venueMediaPublicUrl(settings.dinkhubGcashQrImagePath);

  return (
    <Container className="py-3 sm:py-4">
      <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Platform settings</h1>
      <p className="text-sm text-[var(--color-fg-muted)]">
        Controls the booking fee charged to players and the DinkHub GCash details venue owners use
        to remit weekly invoices.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-2 pt-6">
            <h2 className="font-semibold">Base booking fee</h2>
            <p className="text-3xl font-bold tracking-tight">
              {formatPHP(settings.baseBookingFeeCentavos)}
            </p>
            <p className="text-xs text-[var(--color-fg-muted)]">
              Charged once per booking. Snapshotted to the booking row at creation — historical
              bookings keep their old fee. Use vouchers to give per-code discounts.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 pt-6">
            <h2 className="font-semibold">Last updated</h2>
            <p className="text-sm">{formatDateTimeManila(settings.updatedAt)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8">
        <SettingsForm settings={serialise(settings)} qrUrl={qrUrl} />
      </div>
    </Container>
  );
}

function serialise(s: {
  baseBookingFeeCentavos: bigint;
  invoiceDueDays: number;
  dinkhubGcashAccountName: string | null;
  dinkhubGcashAccountNumber: string | null;
  dinkhubGcashQrImagePath: string | null;
}): {
  baseBookingFeePhp: string;
  invoiceDueDays: number;
  dinkhubGcashAccountName: string | null;
  dinkhubGcashAccountNumber: string | null;
  dinkhubGcashQrImagePath: string | null;
} {
  // Convert centavos -> "20.00" for the form input.
  const cents = s.baseBookingFeeCentavos;
  const whole = cents / 100n;
  const frac = (cents % 100n).toString().padStart(2, "0");
  return {
    baseBookingFeePhp: `${whole.toString()}.${frac}`,
    invoiceDueDays: s.invoiceDueDays,
    dinkhubGcashAccountName: s.dinkhubGcashAccountName,
    dinkhubGcashAccountNumber: s.dinkhubGcashAccountNumber,
    dinkhubGcashQrImagePath: s.dinkhubGcashQrImagePath,
  };
}
