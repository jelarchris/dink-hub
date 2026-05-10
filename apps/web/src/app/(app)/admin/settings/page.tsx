import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { getSystemSettings } from "@/features/system-settings";
import { venueMediaPublicUrl } from "@/lib/venue-media";
import { formatPHP } from "@/lib/money";
import { formatDateTimeManila } from "@/lib/date";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Promo & settings" };

export default async function AdminSettingsPage() {
  const settings = await getSystemSettings();
  const qrUrl = venueMediaPublicUrl(settings.dinkhubGcashQrImagePath);

  return (
    <Container className="py-3 sm:py-4">
      <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Promo &amp; settings</h1>
      <p className="text-sm text-[var(--color-fg-muted)]">
        Controls the homepage banner, the booking fee charged to players, and the DinkHub GCash
        details venue owners use to remit weekly invoices.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardContent className="space-y-2 pt-6">
            <h2 className="font-semibold">Promo status</h2>
            <p className="text-3xl font-bold tracking-tight">
              {settings.promoActive ? "ON" : "OFF"}
            </p>
            <p className="text-xs text-[var(--color-fg-muted)]">
              {settings.promoActive
                ? "Booking fee is ₱0 for every new booking."
                : `Booking fee is ${formatPHP(settings.baseBookingFeeCentavos)} per booking.`}
            </p>
            {settings.promoUntilDate && (
              <p className="text-xs text-[var(--color-fg-muted)]">
                Communicated end date: {settings.promoUntilDate}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 pt-6">
            <h2 className="font-semibold">Base booking fee</h2>
            <p className="text-3xl font-bold tracking-tight">
              {formatPHP(settings.baseBookingFeeCentavos)}
            </p>
            <p className="text-xs text-[var(--color-fg-muted)]">
              Charged once per booking when promo is OFF. Snapshotted to the booking row at
              creation — historical bookings keep their old fee.
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
  promoActive: boolean;
  promoHeadline: string;
  promoDescription: string;
  promoUntilDate: string | null;
  promoShowOnHome: boolean;
  promoShowOnBooking: boolean;
  baseBookingFeeCentavos: bigint;
  invoiceDueDays: number;
  dinkhubGcashAccountName: string | null;
  dinkhubGcashAccountNumber: string | null;
  dinkhubGcashQrImagePath: string | null;
}): {
  promoActive: boolean;
  promoHeadline: string;
  promoDescription: string;
  promoUntilDate: string | null;
  promoShowOnHome: boolean;
  promoShowOnBooking: boolean;
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
    promoActive: s.promoActive,
    promoHeadline: s.promoHeadline,
    promoDescription: s.promoDescription,
    promoUntilDate: s.promoUntilDate,
    promoShowOnHome: s.promoShowOnHome,
    promoShowOnBooking: s.promoShowOnBooking,
    baseBookingFeePhp: `${whole.toString()}.${frac}`,
    invoiceDueDays: s.invoiceDueDays,
    dinkhubGcashAccountName: s.dinkhubGcashAccountName,
    dinkhubGcashAccountNumber: s.dinkhubGcashAccountNumber,
    dinkhubGcashQrImagePath: s.dinkhubGcashQrImagePath,
  };
}
