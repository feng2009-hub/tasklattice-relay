import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Bot, Box, Container, Cpu, ExternalLink, FileLock2, Globe2, type LucideIcon } from "lucide-react";
import { sandboxPolicies } from "@tasklattice/contracts";
import { AgentStatusBadge } from "@/components/agents/agent-status-badge";
import { ProvisioningActivity } from "@/components/agents/provisioning-activity";
import { AgentTerminal } from "@/components/terminal";
import { PageHeader } from "@/components/layout/page-header";
import { DetailCard } from "@/components/shared/detail-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export const Route = createFileRoute("/agents/$agentId")({
  component: AgentDetail,
});

function endpointDisplayUrl(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return "OpenClaw Web UI";
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

  if (!agent.data)
    return (
      <div className="py-20 text-center text-sm text-muted-foreground">
        Loading Agent…
      </div>
    );

  const policy = sandboxPolicies.find(
    (item) => item.id === (agent.data.policyId ?? "restricted"),
  );
  const hierarchy: Array<{ icon: LucideIcon; label: string; value: string }> = [
    { icon: Bot, label: "Agent", value: "Desired identity" },
    { icon: Cpu, label: "Instance", value: agent.data.id.slice(0, 8) },
    { icon: Box, label: "OpenShell Sandbox", value: agent.data.sandboxName },
    { icon: Container, label: "Pod", value: "Ephemeral realization" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Agent / Instances / ${agent.data.id.slice(0, 8)}`}
        title={agent.data.name}
        description={agent.data.description || "NemoClaw runtime Instance"}
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
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DetailCard icon={Box} label="Runtime" value="NemoClaw / OpenClaw" />
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
          value={policy?.name ?? agent.data.policyId ?? "Restricted"}
        />
      </div>
      <section
        aria-labelledby="http-endpoint-title"
        className="grid gap-4 border-y px-1 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
      >
        <div className="min-w-0">
          <h2 id="http-endpoint-title" className="flex items-center gap-2 text-base font-semibold">
            <Globe2 className="size-4" />
            HTTP Endpoint
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Open the NemoClaw / OpenClaw Web UI exposed through OpenShell service routing.
          </p>
          {agent.data.httpEndpoint?.status === "READY" && agent.data.httpEndpoint.url ? (
            <p className="mt-2 truncate font-mono text-xs text-muted-foreground">
              {endpointDisplayUrl(agent.data.httpEndpoint.url)}
            </p>
          ) : (
            <p role="status" className="mt-2 text-xs text-muted-foreground">
              {agent.data.status === "READY"
                ? agent.data.httpEndpoint?.reason ??
                  "OpenShell has not published the Web UI endpoint yet."
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
              Open Web UI <ExternalLink />
            </a>
          </Button>
        ) : (
          <Button className="h-11" disabled>
            Open Web UI
          </Button>
        )}
      </section>
      <Card id="terminal" className="scroll-mt-24">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Container className="size-4" />
            NemoClaw TUI
          </CardTitle>
          <CardDescription>
            Interactive OpenClaw client attached to this Agent&apos;s in-sandbox
            Gateway through OpenShell. This surface never falls back to the
            runner host shell.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AgentTerminal
            agentId={agentId}
            enabled={agent.data.status === "READY"}
            runtimeStatus={runtime.data}
            runtimeError={
              runtime.error instanceof Error ? runtime.error.message : undefined
            }
            runtimeChecking={runtime.isFetching}
            onRecheckRuntime={() => void runtime.refetch()}
          />
        </CardContent>
      </Card>
    </div>
  );
}
