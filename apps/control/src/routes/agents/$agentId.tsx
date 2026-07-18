import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Bot, Box, Container, Cpu, ExternalLink, FileLock2, Globe2, type LucideIcon } from "lucide-react";
import { AgentStatusBadge } from "@/components/agents/agent-status-badge";
import { ProvisioningActivity } from "@/components/agents/provisioning-activity";
import { AgentTerminalWorkspace } from "@/components/agents/agent-terminal-workspace";
import { PageHeader } from "@/components/layout/page-header";
import { DetailCard } from "@/components/shared/detail-card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { getAgentPlatformPresentation } from "@/lib/agent-platforms";

export const Route = createFileRoute("/agents/$agentId")({
  component: AgentDetail,
});

function endpointDisplayUrl(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return "Agent endpoint";
  }
}

function AgentDetail() {
  const { agentId } = Route.useParams();
  const agent = useQuery({
    queryKey: ["agent", agentId],
    queryFn: () => api.getAgent(agentId),
    refetchInterval: (query) =>
      query.state.data?.status === "READY" ||
      query.state.data?.status === "FAILED"
        ? false
        : 1_000,
  });
  const runtime = useQuery({
    queryKey: ["runtime-status"],
    queryFn: api.getRuntimeStatus,
    retry: 1,
    staleTime: 5_000,
  });
  const policies = useQuery({ queryKey: ["sandbox-policies"], queryFn: api.listPolicies });

  if (!agent.data)
    return (
      <div className="py-20 text-center text-sm text-muted-foreground">
        Loading Agent…
      </div>
    );

  const policy = policies.data?.policies.find((item) => item.id === agent.data.policyId);
  const platform = getAgentPlatformPresentation(agent.data.agentPlatform);
  const hierarchy: Array<{ icon: LucideIcon; label: string; value: string }> = [
    { icon: Bot, label: "Agent", value: "Desired identity" },
    { icon: Cpu, label: "Instance", value: agent.data.id.slice(0, 8) },
    { icon: Box, label: "OpenShell Sandbox", value: agent.data.sandboxName },
    { icon: Container, label: "Pod", value: "Ephemeral realization" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={agent.data.name}
        description={agent.data.description || "OpenShell runtime Instance"}
        badge={<AgentStatusBadge status={agent.data.status} />}
      />
      <div className="grid items-stretch border-y text-xs sm:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] sm:items-center">
        {hierarchy.map(({ icon: Icon, label, value }, index) => (
          <div key={label} className="contents">
            <div className="min-w-0 px-3 py-3">
              <div className="flex items-center gap-2 font-medium">
                <Icon className="size-3.5" />
                {label}
              </div>
              <div className="mt-1 truncate font-mono text-muted-foreground">
                {value}
              </div>
            </div>
            {index < 3 ? (
              <ArrowRight className="mx-1 hidden size-3.5 text-muted-foreground sm:block" />
            ) : null}
          </div>
        ))}
      </div>
      {agent.data.status !== "READY" ? (
        <ProvisioningActivity
          status={agent.data.status}
          logs={agent.data.logs}
          {...(agent.data.provisioningStage ? { stage: agent.data.provisioningStage } : {})}
          {...(agent.data.error ? { error: agent.data.error } : {})}
          action={<Link to="/agent/sandboxes/runtime" className="min-h-11 content-center text-xs font-medium text-foreground underline underline-offset-4">Open Sandbox audit</Link>}
        />
      ) : null}
      <AgentTerminalWorkspace
        agentId={agentId}
        agentName={agent.data.name}
        agentPlatform={agent.data.agentPlatform}
        enabled={agent.data.status === "READY"}
        runtimeStatus={runtime.data}
        runtimeError={
          runtime.error instanceof Error ? runtime.error.message : undefined
        }
        runtimeChecking={runtime.isFetching}
        onRecheckRuntime={() => void runtime.refetch()}
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <DetailCard icon={Box} label="Runtime" value={platform.runtimeName} />
        <DetailCard icon={Bot} label="Agent" value={platform.name} />
        <DetailCard
          icon={Cpu}
          label="Provider"
          value={`DeepSeek · ${agent.data.model}`}
        />
        <DetailCard
          label="OpenShell Sandbox"
          value={agent.data.sandboxName}
          mono
        />
        <DetailCard
          icon={FileLock2}
          label="OpenShell Policy"
          value={policy?.name ?? agent.data.policyId}
        />
      </div>
      <section
        aria-labelledby="http-endpoint-title"
        className="grid gap-4 border-y px-1 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
      >
        <div className="min-w-0">
          <h2 id="http-endpoint-title" className="flex items-center gap-2 text-base font-semibold">
            <Globe2 className="size-4" />
            {platform.endpointLabel}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Open the {platform.name} browser surface exposed through OpenShell
            service routing.
          </p>
          {agent.data.httpEndpoint?.status === "READY" && agent.data.httpEndpoint.url ? (
            <p className="mt-2 truncate font-mono text-xs text-muted-foreground">
              {endpointDisplayUrl(agent.data.httpEndpoint.url)}
            </p>
          ) : (
            <p role="status" className="mt-2 text-xs text-muted-foreground">
              {agent.data.status === "READY"
                ? agent.data.httpEndpoint?.reason ??
                  `OpenShell has not published the ${platform.endpointLabel} yet.`
                : "Available after the Instance reaches Ready."}
            </p>
          )}
        </div>
        {agent.data.httpEndpoint?.status === "READY" && agent.data.httpEndpoint.url ? (
          <Button asChild className="h-11">
            <a
              href={agent.data.httpEndpoint.url}
              target="_blank"
              rel="noreferrer"
            >
              Open {platform.endpointLabel} <ExternalLink />
            </a>
          </Button>
        ) : (
          <Button className="h-11" disabled>
            Open {platform.endpointLabel}
          </Button>
        )}
      </section>
    </div>
  );
}
