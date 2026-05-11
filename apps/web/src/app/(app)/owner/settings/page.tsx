import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session";
import { Container } from "@/components/ui/container";
import { Alert } from "@/components/ui/alert";
import { PageHeader, SectionLabel } from "@/components/ui/page-header";
import { getOwnerNotificationPrefs } from "@/features/owner-settings";
import { NotificationPrefsForm } from "./notification-prefs-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notification settings · DinkHub" };

export default async function OwnerSettingsPage() {
  const profile = await getSessionUser();
  if (!profile) redirect("/sign-in?next=/owner/settings");

  if (profile.role !== "venue_owner" && profile.role !== "admin") {
    return (
      <Container className="py-4">
        <Alert variant="warning" title="Owner access required">
          Your account isn&apos;t set up as a venue owner.
        </Alert>
      </Container>
    );
  }

  const savedPrefs = await getOwnerNotificationPrefs(profile.id);

  // Defaults match the DB column default — safe fallback if the profile row
  // was created before migration 0012.
  const prefs = savedPrefs ?? {
    email_daily_digest: true,
    email_on_payment_submitted: true,
    email_on_booking_cancelled: true,
  };

  return (
    <Container className="py-6 max-w-2xl">
      <PageHeader
        kicker="Owner"
        title="Settings"
        subtitle="Manage your venue owner preferences."
      />

      <div className="mt-8 space-y-8">
        <section>
          <SectionLabel>Notifications</SectionLabel>
          <p className="text-sm text-slate-500 mb-4">
            Choose which emails DinkHub sends you. You can change these at any time.
          </p>
          <NotificationPrefsForm prefs={prefs} />
        </section>
      </div>
    </Container>
  );
}
