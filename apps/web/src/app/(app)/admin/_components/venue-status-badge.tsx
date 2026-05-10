import { Badge } from "@/components/ui/badge";
import type { Venue } from "@/db/schema";

export function VenueStatusBadge({ status }: { status: Venue["status"] }) {
  switch (status) {
    case "active":
      return <Badge variant="success">Active</Badge>;
    case "pending_review":
      return <Badge variant="info">Pending review</Badge>;
    case "draft":
      return <Badge variant="neutral">Draft</Badge>;
    case "suspended":
      return <Badge variant="warning">Suspended</Badge>;
    case "rejected":
      return <Badge variant="danger">Rejected</Badge>;
    default:
      return <Badge variant="neutral">{status}</Badge>;
  }
}
