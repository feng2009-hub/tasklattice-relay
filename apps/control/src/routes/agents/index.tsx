import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, Plus } from "lucide-react";
import { AgentCard } from "@/components/agents/agent-card";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export const Route = createFileRoute("/agents/")({ component: Agents });

function Agents() {
  const agents = useQuery({
    queryKey: ["agents"],
    queryFn: api.listAgents,
    refetchInterval: 2_000,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agent instances"
        actions={
          <Button asChild>
            <Link to="/agents/instace/new">
              <Plus />
              Create Agent
            </Link>
          </Button>
        }
      />
      <div className="grid gap-3">
        {agents.data?.map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>
      {agents.data?.length === 0 ? (
        <EmptyState
          icon={Bot}
          title="No Agent instances yet"
          description="Create a NemoClaw-configured Agent in OpenShell to populate this workspace."
        />
      ) : null}
    </div>
  );
}
