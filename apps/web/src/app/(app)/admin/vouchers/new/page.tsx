import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdmin } from "@/features/admin/service";
import { vouchersRepo } from "@/features/vouchers";
import { NewVoucherForm } from "./new-voucher-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · New voucher" };

export default async function NewVoucherPage() {
  await requireAdmin();
  const venues = await vouchersRepo.listActiveVenuesForPicker();
  return (
    <Container className="py-3 sm:py-4">
      <Link
        href="/admin/vouchers"
        className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
      >
        <ArrowLeft className="size-4" /> Back to vouchers
      </Link>
      <h1 className="mt-2 text-xl font-bold tracking-tight sm:text-2xl">New voucher</h1>
      <p className="text-sm text-[var(--color-fg-muted)]">
        The discount applies to the booking fee only. Court fees are never reduced.
      </p>

      <Card className="mt-6 max-w-2xl">
        <CardContent className="pt-6">
          <NewVoucherForm venues={venues} />
        </CardContent>
      </Card>
    </Container>
  );
}
