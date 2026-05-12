import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Recovery-flow chrome. Mirrors (auth)/layout.tsx visually but does NOT
 * redirect signed-in users — the recovery link installs a session and the
 * user must remain on this page to choose a new password.
 */
export default function AuthRecoveryLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-[var(--color-bg-subtle)]">
      <header className="px-4 py-6 sm:px-6 lg:px-8">
        <Link href="/" className="inline-flex items-center font-bold tracking-tight">
          <span className="text-lg text-[var(--color-brand-600)]">Dink</span><span className="text-lg text-[var(--color-accent-600)]">Hub</span>
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16 pt-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
