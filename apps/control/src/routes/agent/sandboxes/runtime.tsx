import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Box, Eye, RefreshCw, ScrollText, ShieldCheck } from "lucide-react";
import { sandboxPolicies } from "@tasklattice/contracts";
import { AgentStatusBadge } from "@/components/agents/agent-status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusDot } from "@/components/shared/status-dot";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/agent/sandboxes/runtime")({ component: OpenShellRuntimePage });

function OpenShellRuntimePage() {
  const [selectedId, setSelectedId] = useState<string>();
  const [tab, setTab] = useState<"overview" | "audit">("audit");
  const agents = useQuery({
    queryKey: ["agents"],
    queryFn: api.listAgents,
    refetchInterval: 2_000,
  });
  const runtime = useQuery({
    queryKey: ["runtime-status"],
    queryFn: api.getRuntimeStatus,
    retry: 1,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
  const openShellAvailable =
    runtime.data?.terminal.available &&
    runtime.data.terminal.transport === "openshell";
  const sandboxes = useMemo(() => agents.data ?? [], [agents.data]);
  const selected =
    sandboxes.find((agent) => agent.id === selectedId) ?? sandboxes[0];
  const audit = useQuery({
    queryKey: ["sandbox-audit", selected?.id],
    queryFn: () => api.getAgentAudit(selected!.id),
    enabled: Boolean(selected?.id && selected.status === "READY"),
    retry: 1,
    refetchInterval: 5_000,
  });

  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Agent / Sandboxes / Runtime"
        title="OpenShell runtime"
        description="Inspect the OpenShell isolation boundary for each Agent Instance, then follow its current Sandbox and Pod realization."
        badge={
          <StatusDot
            label={runtime.isPending ? "Checking OpenShell" : openShellAvailable ? "OpenShell connected" : "OpenShell unavailable"}
            tone={runtime.isPending ? "neutral" : openShellAvailable ? "success" : runtime.error ? "danger" : "warning"}
          />
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Sandbox list</CardTitle>
            <CardDescription>
              Instance → OpenShell Sandbox → Pod. Runtime state is observed from
              the stable Sandbox boundary, not inferred from a Pod identity.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {sandboxes.length ? (
              <>
                <div className="hidden grid-cols-[minmax(0,1.4fr)_1fr_0.7fr_auto] gap-3 border-b px-4 py-2 text-xs text-muted-foreground sm:grid">
                  <span>Sandbox</span>
                  <span>Agent instance</span>
                  <span>Revision</span>
                  <span>State</span>
                </div>
                {sandboxes.map((agent) => (
                  <button
                    key={agent.id}
                    type="button"
                    aria-pressed={selected?.id === agent.id}
                    onClick={() => setSelectedId(agent.id)}
                    className={cn(
                      "grid min-h-16 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b px-4 py-3 text-left text-sm transition-colors last:border-b-0 hover:bg-muted/45 focus-visible:outline-2 focus-visible:outline-offset-[-2px] sm:grid-cols-[minmax(0,1.4fr)_1fr_0.7fr_auto]",
                      selected?.id === agent.id &&
                        "bg-muted/70 shadow-[inset_3px_0_0_var(--foreground)]",
                    )}
                  >
                    <span className="min-w-0">
                      <strong className="block truncate font-mono text-xs">
                        {agent.sandboxName}
                      </strong>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        OpenShell Sandbox CR
                      </span>
                    </span>
                    <span className="hidden truncate sm:block">{agent.name}</span>
                    <span className="hidden font-mono text-xs sm:block">
                      {agent.id.slice(0, 8)}
                    </span>
                    <AgentStatusBadge status={agent.status} />
                  </button>
                ))}
              </>
            ) : (
              <EmptyState
                icon={Box}
                title="No Sandboxes observed"
                description="Create an Instance to provision its Sandbox boundary."
              />
            )}
          </CardContent>
        </Card>

        {selected ? (
          <Card className="xl:sticky xl:top-24">
            <CardHeader className="border-b">
              <div className="flex items-center justify-between gap-3">
                <StatusDot
                  label={selected.runtimePhase ?? selected.status}
                  tone={selected.status === "READY" ? "success" : "warning"}
                />
                <span className="text-xs text-muted-foreground">Scoped audit</span>
              </div>
              <CardTitle className="mt-3 break-all font-mono text-sm">
                {selected.sandboxName}
              </CardTitle>
              <CardDescription>
                Agent: {selected.name} · Pod realization:{" "}
                {selected.status === "READY" ? "current" : "unavailable"}
              </CardDescription>
              <div className="mt-3 flex border-b">
                {(["overview", "audit"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={tab === value}
                    onClick={() => setTab(value)}
                    className={cn(
                      "min-h-11 border-b-2 border-transparent px-3 text-xs capitalize text-muted-foreground",
                      tab === value && "border-foreground text-foreground",
                    )}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {tab === "overview" ? (
                <dl className="text-xs">
                  {[
                    ["Runtime layer", "OpenShell"],
                    ["Stable identity", selected.sandboxName],
                    ["Instance", selected.id.slice(0, 8)],
                    ["Pod", selected.status === "READY" ? "1 / 1" : "0 / 1"],
                    ["Workspace", "Persistent PVC"],
                    ["Policy", sandboxPolicies.find((policy) => policy.id === (selected.policyId ?? "restricted"))?.name ?? selected.policyId ?? "Restricted"],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="flex min-h-10 items-center justify-between gap-3 border-b"
                    >
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="max-w-[65%] break-all text-right font-medium">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <div className="space-y-1">
                  <div className="flex min-h-10 items-center justify-between gap-3 border-b text-xs">
                    <span className="text-muted-foreground">OpenShell OCSF · last 24 hours</span>
                    <button type="button" onClick={() => void audit.refetch()} disabled={audit.isFetching} className="grid size-10 place-items-center text-muted-foreground hover:text-foreground disabled:opacity-50" aria-label="Refresh OpenShell audit log"><RefreshCw className={cn("size-3.5", audit.isFetching && "animate-spin")} /></button>
                  </div>
                  {audit.isPending && selected.status === "READY" ? <p className="py-6 text-center text-xs text-muted-foreground">Reading OpenShell audit events…</p> : null}
                  {audit.error ? <p role="alert" className="border-l-2 border-destructive bg-destructive/5 px-3 py-3 text-xs text-destructive">{audit.error.message}</p> : null}
                  {audit.data?.map((event) => (
                    <div key={event.id} className="grid grid-cols-[auto_1fr] gap-3 border-b py-3 text-xs last:border-b-0">
                      <ShieldCheck className={cn("mt-0.5 size-3.5", (event.decision === "DENIED" || event.decision === "BLOCKED" || event.decision === "REJECTED") ? "text-destructive" : "text-muted-foreground")} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <strong className="font-medium">{event.category} · {event.decision}</strong>
                          <time className="text-[10px] text-muted-foreground">{new Date(event.timestamp).toLocaleTimeString()}</time>
                        </div>
                        <p className="mt-1 break-words font-mono text-[10px] leading-5 text-muted-foreground">{event.summary}</p>
                        {event.policy ? <span className="mt-1 inline-block text-[10px] text-muted-foreground">Policy: {event.policy}</span> : null}
                      </div>
                    </div>
                  ))}
                  {!audit.isPending && !audit.error && !audit.data?.length ? <p className="py-6 text-center text-xs leading-5 text-muted-foreground">No OpenShell OCSF policy decisions are available for this sandbox yet.</p> : null}
                  <p className="pt-2 text-xs leading-5 text-muted-foreground">
                    OpenShell records network, process, filesystem, and configuration decisions. Terminal keystrokes, prompts, and file contents are not captured.
                  </p>
                </div>
              )}
              <Button asChild className="h-11 w-full">
                <Link
                  to="/agents/$agentId"
                  params={{ agentId: selected.id }}
                >
                  {tab === "audit" ? <ScrollText /> : <Eye />}
                  Open Agent detail
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
