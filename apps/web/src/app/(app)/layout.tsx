import type { ReactNode } from "react";
import { Suspense } from "react";
import { NavbarServer } from "@/components/navbar.server";
import { Footer } from "@/components/footer";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense
        fallback={<div className="h-16 border-b border-[var(--color-border-default)]" />}
      >
        <NavbarServer />
      </Suspense>
      <div className="flex flex-1 flex-col">{children}</div>
      <Footer />
    </>
  );
}
