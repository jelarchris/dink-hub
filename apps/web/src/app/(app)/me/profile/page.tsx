import "server-only";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session";
import { Container } from "@/components/ui/container";
import { ProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Edit Profile | DinkHub",
};

export default async function ProfilePage() {
  const profile = await getSessionUser();
  if (!profile) redirect("/sign-in");

  // All roles can edit their own personal profile here. Owners separately
  // manage business prefs (daily digest, payouts) at /owner/settings.

  return (
    <main className="py-8 pb-16">
      <Container className="max-w-lg">
        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Edit profile
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Keep your info up to date so venues can reach you.
          </p>
        </header>

        <ProfileForm profile={profile} />
      </Container>
    </main>
  );
}
