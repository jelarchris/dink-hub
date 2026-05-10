import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { isAdminError } from "@/features/admin";
import { getUserDetail, requireAdmin } from "@/features/admin/service";
import { formatDateTimeManila } from "@/lib/date";
import { formatPHP } from "@/lib/money";
import { UpdateRoleForm } from "./update-role-form";
import { SuspensionForm } from "./suspension-form";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminUserDetailPage({ params }: PageProps) {
  const { id } = await params;
  const admin = await requireAdmin();

  let detail;
  try {
    detail = await getUserDetail(id);
  } catch (err) {
    if (isAdminError(err) && err.code === "user_not_found") notFound();
    throw err;
  }

  const { profile, venueCount, bookingCount, recentBookings } = detail;
  const isSelf = admin.id === profile.id;

  return (
    <Container className="py-8">
      <Link
        href="/admin/users"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
      >
        <ArrowLeft className="size-4" /> Back to users
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{profile.displayName}</h1>
          <p className="text-sm text-[var(--color-fg-muted)]">{profile.email}</p>
        </div>
        <div className="flex items-center gap-2">
          {profile.suspendedAt && <Badge variant="danger">Suspended</Badge>}
          <Badge variant={profile.role === "admin" ? "warning" : "neutral"}>
            {profile.role}
          </Badge>
        </div>
      </div>

      {profile.suspendedAt && profile.suspensionReason && (
        <Alert variant="danger" title="Suspension reason" className="mt-4">
          {profile.suspensionReason}
        </Alert>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="space-y-4 pt-6">
            <h2 className="font-semibold">Profile</h2>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Row label="Phone" value={profile.phoneE164 ?? "—"} />
              <Row
                label="Location"
                value={
                  [profile.city, profile.province].filter(Boolean).join(", ") || "—"
                }
              />
              <Row label="Venues owned" value={String(venueCount)} />
              <Row label="Bookings made" value={String(bookingCount)} />
              <Row label="Joined" value={formatDateTimeManila(profile.createdAt)} />
              <Row
                label="Suspended at"
                value={profile.suspendedAt ? formatDateTimeManila(profile.suspendedAt) : "—"}
              />
            </dl>

            <div>
              <h3 className="text-sm font-semibold">Recent bookings</h3>
              {recentBookings.length === 0 ? (
                <p className="mt-1 text-xs text-[var(--color-fg-muted)]">No bookings yet.</p>
              ) : (
                <ul className="mt-2 divide-y divide-[var(--color-border-default)] text-sm">
                  {recentBookings.map((b) => (
                    <li
                      key={b.id}
                      className="flex items-center justify-between py-2 text-xs"
                    >
                      <Link
                        href={`/admin/bookings/${b.id}`}
                        className="text-[var(--color-brand-700)] hover:underline"
                      >
                        {formatDateTimeManila(b.startAt)}
                      </Link>
                      <span>{formatPHP(b.totalCentavos)}</span>
                      <span className="text-[var(--color-fg-muted)]">{b.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 pt-6">
              <h2 className="font-semibold">Role</h2>
              {isSelf ? (
                <p className="text-xs text-[var(--color-fg-muted)]">
                  You cannot change your own role.
                </p>
              ) : (
                <UpdateRoleForm userId={profile.id} currentRole={profile.role} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 pt-6">
              <h2 className="font-semibold">Account access</h2>
              {isSelf ? (
                <p className="text-xs text-[var(--color-fg-muted)]">
                  You cannot suspend your own account.
                </p>
              ) : (
                <SuspensionForm
                  userId={profile.id}
                  isSuspended={profile.suspendedAt !== null}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Container>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">{label}</dt>
      <dd className="mt-0.5 break-words">{value}</dd>
    </div>
  );
}
