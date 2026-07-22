import type { Agent } from "@tasklattice/contracts";
import { Link } from "@tanstack/react-router";
import { AgentStatusBadge } from "./agent-status-badge";
import { Card, CardContent } from "@/components/ui/card";

export function AgentCard({ agent }: { agent: Agent }) {
  return (
    <Link to="/agents/$agentId" params={{ agentId: agent.id }}>
      <Card className="transition-colors hover:bg-muted/30">
        <CardContent className="flex items-center justify-between gap-4 py-5">
          <div className="min-w-0">
            <div className="truncate font-medium">{agent.name}</div>
            <div className="mt-1 truncate font-mono text-xs text-muted-foreground">
              {agent.sandboxName}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-4 text-sm text-muted-foreground">
            <span className="hidden sm:inline">Platform-managed inference</span>
            <AgentStatusBadge status={agent.status} />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
