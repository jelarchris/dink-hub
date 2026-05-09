import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/features/auth/service";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  // Already signed in? Bounce to home.
  const user = await getCurrentUser();
  if (user) redirect("/");

  return (
    <div className="flex min-h-svh flex-col bg-[var(--color-bg-subtle)]">
      <header className="px-4 py-6 sm:px-6 lg:px-8">
        <Link href="/" className="inline-flex items-center gap-2 font-bold tracking-tight">
          <span
            aria-hidden="true"
            className="inline-flex size-8 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-brand-500)] text-white"
          >
            D
          </span>
          <span className="text-lg">DinkHub</span>
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16 pt-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
