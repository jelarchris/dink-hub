import { Badge } from "@/components/ui/badge";
import type { OwnerInvoice } from "@/db/schema";

export function OwnerInvoiceStatusBadge({ status }: { status: OwnerInvoice["status"] }) {
  switch (status) {
    case "open":
      return <Badge variant="warning">Open</Badge>;
    case "submitted":
      return <Badge variant="info">Awaiting verification</Badge>;
    case "verified":
      return <Badge variant="success">Paid</Badge>;
    case "rejected":
      return <Badge variant="danger">Rejected</Badge>;
    case "void":
      return <Badge variant="neutral">Void</Badge>;
  }
}
