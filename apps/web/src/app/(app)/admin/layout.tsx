import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BookOpen,
  Building2,
  ClipboardList,
  LayoutDashboard,
  PercentCircle,
  Users,
} from "lucide-react";
import { getSessionUser } from "@/server/session";
import { Container } from "@/components/ui/container";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const profile = await getSessionUser();
  if (!profile) redirect(`/sign-in?next=${encodeURIComponent("/admin")}`);
  if (profile.role !== "admin") {
    return (
      <Container className="py-12">
        <div className="rounded-[var(--radius-md)] border border-red-200 bg-red-50 p-6 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          <h1 className="text-lg font-semibold">Admin access required</h1>
          <p className="mt-1 text-sm">
            Your account ({profile.email}) is not an admin. Ask another admin to grant access.
          </p>
        </div>
      </Container>
    );
  }
  if (profile.suspendedAt) {
    return (
      <Container className="py-12">
        <div className="rounded-[var(--radius-md)] border border-red-200 bg-red-50 p-6 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          <h1 className="text-lg font-semibold">Account suspended</h1>
          <p className="mt-1 text-sm">{profile.suspensionReason ?? "Contact support."}</p>
        </div>
      </Container>
    );
  }

  return (
    <div className="flex flex-1">
      <aside className="hidden w-56 shrink-0 border-r border-[var(--color-border-default)] bg-[var(--color-bg-muted)]/40 md:block">
        <nav className="sticky top-16 flex flex-col gap-1 p-3 text-sm">
          <SidebarLink href="/admin" icon={<LayoutDashboard className="size-4" />}>
            Dashboard
          </SidebarLink>
          <SidebarLink href="/admin/venues" icon={<Building2 className="size-4" />}>
            Venues
          </SidebarLink>
          <SidebarLink href="/admin/users" icon={<Users className="size-4" />}>
            Users
          </SidebarLink>
          <SidebarLink href="/admin/bookings" icon={<BookOpen className="size-4" />}>
            Bookings
          </SidebarLink>
          <SidebarLink href="/admin/system-fee" icon={<PercentCircle className="size-4" />}>
            System fee
          </SidebarLink>
          <SidebarLink href="/admin/audit" icon={<ClipboardList className="size-4" />}>
            Audit log
          </SidebarLink>
        </nav>
      </aside>
      <main className="flex-1">{children}</main>
    </div>
  );
}

function SidebarLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-[var(--radius-md)] px-3 py-2 text-[var(--color-fg-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-fg)]"
    >
      {icon}
      {children}
    </Link>
  );
}
