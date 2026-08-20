import type { InstanceStatus } from "@tali/contracts";
import { Badge } from "@/components/ui/badge";

export function AgentStatusBadge({ status }: { status: InstanceStatus }) {
  return (
    <Badge
      variant={
        status === "READY"
          ? "default"
          : status === "FAILED"
            ? "destructive"
            : "secondary"
      }
    >
      {status}
    </Badge>
  );
}
