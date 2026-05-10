import { Badge } from "@/components/ui/badge";

export function PayoutStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "paid":
      return <Badge variant="success">{status}</Badge>;
    case "pending":
    case "processing":
      return <Badge variant="info">{status}</Badge>;
    case "on_hold":
      return <Badge variant="warning">on hold</Badge>;
    case "failed":
      return <Badge variant="danger">{status}</Badge>;
    default:
      return <Badge variant="neutral">{status}</Badge>;
  }
}
