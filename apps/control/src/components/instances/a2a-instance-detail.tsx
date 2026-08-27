import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { A2aStandardAgentInstanceDetail } from "@tali/contracts";
import {
  ArrowLeft,
  Check,
  ExternalLink,
  FileJson,
  Link2,
  MoreHorizontal,
  Network,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  SquareTerminal,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { AgentGardenIcon } from "@/components/agent-garden/agent-garden-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurrentProjectId } from "@/hooks/use-project";
import { useProjectQueryScope } from "@/hooks/use-project-query-scope";
import { api } from "@/lib/api";
import { formatPlatformDateTime } from "@/lib/platform-preferences";
import { AgentInstanceActivityTab } from "./agent-instance-activity-tab";
import { AgentLiveLogs } from "./agent-live-logs";
import { DeleteInstanceSheet } from "./delete-instance-sheet";
import type { InstanceDetailTab } from "./instance-detail-model";
import {
  CopyableValue,
  DefinitionList,
  DetailCardHeader,
  InstanceStatusBadge,
  RelativeTime,
} from "./instance-detail-shared";
import { InstanceTabs } from "./instance-detail-tabs";

function Capability({ enabled, label }: { enabled: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-3 last:border-b-0">
      <span className="text-sm">{label}</span>
      <Badge variant="outline" className={enabled ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}>
        {enabled ? <Check /> : <X />} {enabled ? "Supported" : "Not advertised"}
      </Badge>
    </div>
  );
}

function A2aHeader({
  detail,
  canManage,
  refreshing,
  onRefresh,
  onDelete,
}: {
  detail: A2aStandardAgentInstanceDetail;
  canManage: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onDelete: () => void;
}) {
  const projectId = useCurrentProjectId();
  return (
    <header className="border-b">
      <div className="flex flex-col gap-5 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <Button asChild variant="ghost" size="icon" className="size-11 shrink-0">
            <Link to="/$projectId/instances" params={{ projectId }} aria-label="Back to Instances"><ArrowLeft /></Link>
          </Button>
          <AgentGardenIcon type="a2a" className="size-14" />
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="truncate font-display text-2xl font-medium tracking-tight sm:text-3xl">{detail.name}</h1>
              <InstanceStatusBadge status={detail.status} />
              <Badge variant="outline">A2A Standard</Badge>
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span>{detail.platform.name}</span><span aria-hidden="true">·</span>
              <span>Kubernetes managed Agent</span><span aria-hidden="true">·</span>
              <span>Updated <RelativeTime value={detail.updatedAt} /></span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 pl-14 sm:pl-[7.5rem] lg:pl-0">
          <Button type="button" variant="outline" className="min-h-11" disabled={!canManage || refreshing} onClick={onRefresh}>
            <RefreshCw className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Rediscovering…" : "Rediscover Agent Card"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline" className="min-h-11">More <MoreHorizontal /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem asChild>
                <Link to="/$projectId/agent-garden/$agentId" params={{ projectId, agentId: detail.definition.id }}><FileJson />View definition</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" disabled={!canManage || detail.connections.length > 0} onSelect={onDelete}>
                <Trash2 /> Remove managed Instance
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

function A2aOverview({ detail }: { detail: A2aStandardAgentInstanceDetail }) {
  const projectId = useCurrentProjectId();
  const protocol = detail.protocols[0];
  return (
    <div className="mt-6 space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          ["Runtime", detail.status === "READY" ? "Healthy" : detail.status, detail.runtimeView.podName ?? "Pod pending"],
          ["Agent Card", protocol?.agentCardStatus ?? "UNCHECKED", protocol?.lastDiscoveredAt ? `Checked ${formatPlatformDateTime(protocol.lastDiscoveredAt)}` : "Discovery evidence unavailable"],
          ["A2A skills", String(protocol?.skills.length ?? 0), protocol?.binding ?? "Protocol binding unavailable"],
          ["Connections", String(detail.connections.length), detail.connections.length ? "Coordinator access granted" : "Not connected"],
        ].map(([label, value, description]) => (
          <Card key={label} size="sm">
            <CardContent>
              <p className="text-xs text-muted-foreground">{label}</p>
              <strong className="mt-2 block text-xl font-semibold">{value}</strong>
              <p className="mt-1 truncate text-[11px] text-muted-foreground">{description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,.8fr)]">
        <Card>
          <DetailCardHeader title="Runtime identity" description="The deployed workload and A2A protocol identity are separate dimensions of one Agent Instance." />
          <CardContent>
            <DefinitionList columns={2} items={[
              { label: "Instance ID", value: <CopyableValue value={detail.id} /> },
              { label: "Definition ID", value: <CopyableValue value={detail.definition.id} /> },
              { label: "Namespace", value: <CopyableValue value={detail.runtimeView.namespace} /> },
              { label: "Pod", value: <CopyableValue value={detail.runtimeView.podName} /> },
              { label: "Deployment", value: <CopyableValue value={detail.runtimeView.workloadName} /> },
              { label: "Service", value: <CopyableValue value={detail.runtimeView.serviceName} /> },
              { label: "Endpoint", value: <CopyableValue value={protocol?.endpoint} /> },
              { label: "Agent Card", value: <CopyableValue value={protocol?.agentCardUrl} /> },
            ]} />
          </CardContent>
        </Card>
        <Card>
          <DetailCardHeader title="Coordinator connections" description="Supervisors permitted to discover and invoke this A2A Agent." />
          <CardContent>
            {detail.connections.length ? <div className="space-y-3">{detail.connections.map((connection) => (
              <Link key={connection.id} to="/$projectId/instances/$instanceId" params={{ projectId, instanceId: connection.coordinatorInstanceId }} className="flex items-center gap-3 border bg-muted/15 p-3 transition-colors hover:border-primary/30 hover:bg-primary/5">
                <Network className="size-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1"><strong className="block truncate text-xs">{connection.coordinatorInstanceId}</strong><span className="mt-1 block text-[11px] text-muted-foreground">{connection.approvalMode === "AUTO_READ_ONLY" ? "Auto read-only" : "Human approval required"}</span></span>
                <Link2 className="size-3.5 text-muted-foreground" />
              </Link>
            ))}</div> : <div className="flex min-h-40 flex-col items-center justify-center text-center"><Link2 className="size-5 text-muted-foreground" /><strong className="mt-3 text-sm">Not connected</strong><p className="mt-1 text-xs text-muted-foreground">Connect this Agent to Hermes or OpenClaw from Agent Garden.</p></div>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function A2aConfiguration({ detail }: { detail: A2aStandardAgentInstanceDetail }) {
  const protocol = detail.protocols[0];
  return (
    <div className="mt-6 grid gap-6 xl:grid-cols-2">
      <Card>
        <DetailCardHeader title="Runtime configuration" description="Immutable deployment evidence captured during managed onboarding." />
        <CardContent><DefinitionList items={[
          { label: "Runtime", value: "Kubernetes · Project Main Space" },
          { label: "Image", value: <CopyableValue value={detail.runtimeView.imageReference} /> },
          { label: "Image digest", value: <CopyableValue value={detail.runtimeView.imageDigest} /> },
          { label: "Namespace", value: <CopyableValue value={detail.runtimeView.namespace} /> },
          { label: "Workload", value: <CopyableValue value={detail.runtimeView.workloadName} /> },
          { label: "Container", value: <span className="font-mono text-[11px]">agent</span> },
        ]} /></CardContent>
      </Card>
      <Card>
        <DetailCardHeader title="A2A configuration" description="Discovered Agent Card and invocation surface used by Coordinator runtimes." />
        <CardContent><DefinitionList items={[
          { label: "Protocol", value: `A2A ${protocol?.version ?? "1.0"}` },
          { label: "Binding", value: protocol?.binding ?? "—" },
          { label: "Direction", value: protocol?.direction.join(", ") ?? "SERVER" },
          { label: "Endpoint", value: <CopyableValue value={protocol?.endpoint} /> },
          { label: "Agent Card URL", value: <CopyableValue value={protocol?.agentCardUrl} /> },
          { label: "Discovery status", value: protocol?.agentCardStatus ?? "UNCHECKED" },
        ]} /></CardContent>
      </Card>
    </div>
  );
}

function A2aCapabilities({ detail }: { detail: A2aStandardAgentInstanceDetail }) {
  const protocol = detail.protocols[0];
  return (
    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(18rem,.65fr)_minmax(0,1.35fr)]">
      <Card>
        <DetailCardHeader title="Capability matrix" description="UI behavior is driven by these normalized capabilities, not by an A2A-specific page type." />
        <CardContent>
          <Capability label="Accepts delegation" enabled={detail.capabilities.acceptsDelegation} />
          <Capability label="Can delegate" enabled={detail.capabilities.canDelegate} />
          <Capability label="Interactive surface" enabled={detail.capabilities.interactive} />
          <Capability label="Live runtime logs" enabled={detail.capabilities.liveLogs} />
          <Capability label="Executable terminal" enabled={detail.capabilities.terminal} />
          <Capability label="A2A streaming" enabled={protocol?.capabilities.streaming ?? false} />
          <Capability label="Push notifications" enabled={protocol?.capabilities.pushNotifications ?? false} />
        </CardContent>
      </Card>
      <Card>
        <DetailCardHeader title="Advertised A2A skills" description={`${protocol?.skills.length ?? 0} skills discovered from the Agent Card.`} />
        <CardContent>
          {protocol?.skills.length ? <div className="grid gap-3 md:grid-cols-2">{protocol.skills.map((skill) => (
            <div key={skill.id} className="border bg-muted/15 p-4">
              <div className="flex items-center justify-between gap-3"><strong className="text-sm">{skill.name}</strong><Badge variant="outline">{skill.id}</Badge></div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{skill.description || "No description advertised."}</p>
              {skill.tags.length ? <div className="mt-3 flex flex-wrap gap-1.5">{skill.tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}</div> : null}
            </div>
          ))}</div> : <p className="py-12 text-center text-sm text-muted-foreground">No skills were advertised.</p>}
          <details className="mt-5 border bg-[#0b0f0e] text-white">
            <summary className="cursor-pointer px-4 py-3 text-xs font-medium">Normalized protocol JSON</summary>
            <pre className="max-h-96 overflow-auto border-t border-white/10 p-4 text-[11px] leading-5 text-white/70">{JSON.stringify(protocol, null, 2)}</pre>
          </details>
        </CardContent>
      </Card>
    </div>
  );
}

function A2aLogs({
  detail,
  canViewAuditLogs,
  canViewLogs,
}: {
  detail: A2aStandardAgentInstanceDetail;
  canViewAuditLogs: boolean;
  canViewLogs: boolean;
}) {
  const scope = useProjectQueryScope();
  const audits = useQuery({
    queryKey: scope.key("a2a-instance-audit", detail.definition.id),
    queryFn: () => api.listAuditLogs({ query: detail.definition.id, limit: 50 }),
    enabled: canViewAuditLogs,
    retry: 1,
  });
  return (
    <div className="mt-6">
      <Tabs defaultValue="runtime" className="gap-4">
        <TabsList>
          <TabsTrigger value="runtime">Runtime live</TabsTrigger>
          <TabsTrigger value="lifecycle">Lifecycle</TabsTrigger>
          <TabsTrigger value="protocol">A2A protocol</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>
        <TabsContent value="runtime">
          {canViewLogs && detail.runtimeView.podName ? <AgentLiveLogs instanceId={detail.id} podName={detail.runtimeView.podName} /> : (
            <Card><CardContent className="py-12 text-center"><ShieldCheck className="mx-auto size-5 text-muted-foreground" /><strong className="mt-3 block text-sm">Runtime logs unavailable</strong><p className="mt-1 text-xs text-muted-foreground">You need Agent log-view permission and an active managed Pod.</p></CardContent></Card>
          )}
        </TabsContent>
        <TabsContent value="lifecycle">
          <Card><DetailCardHeader title="Lifecycle log" description="Stored reconciliation events remain available when the Pod is gone." /><CardContent><pre className="max-h-[34rem] overflow-auto whitespace-pre-wrap py-2 font-mono text-xs leading-6">{detail.instance.logs.join("\n") || "No lifecycle events recorded."}</pre></CardContent></Card>
        </TabsContent>
        <TabsContent value="protocol">
          <Card><DetailCardHeader title="A2A discovery evidence" description="Agent Card status and errors; request payloads are not exposed here." /><CardContent><DefinitionList items={[
            { label: "Status", value: detail.protocols[0]?.agentCardStatus ?? "UNCHECKED" },
            { label: "Last discovered", value: detail.protocols[0]?.lastDiscoveredAt ? formatPlatformDateTime(detail.protocols[0].lastDiscoveredAt) : "—" },
            { label: "Discovery error", value: detail.protocols[0]?.lastDiscoveryError ?? "None" },
            { label: "Protocol", value: `${detail.protocols[0]?.binding ?? "A2A"} ${detail.protocols[0]?.version ?? "1.0"}` },
          ]} /></CardContent></Card>
        </TabsContent>
        <TabsContent value="audit">
          <Card><DetailCardHeader title="Invocation audit" description="Control-plane discovery and delegation events correlated to this Agent definition." /><CardContent>
            {!canViewAuditLogs ? <p className="py-8 text-center text-sm text-muted-foreground">You do not have permission to view Project audit events.</p> : audits.isPending ? <p className="py-8 text-center text-sm text-muted-foreground">Loading audit events…</p> : audits.data?.data.length ? <div className="divide-y">{audits.data.data.map((event) => <div key={event.id} className="py-3"><div className="flex items-center justify-between gap-3"><strong className="text-xs">{event.action}</strong><Badge variant={event.outcome === "failed" ? "destructive" : "outline"}>{event.outcome}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{event.summary} · {formatPlatformDateTime(event.occurredAt)}</p></div>)}</div> : <p className="py-8 text-center text-sm text-muted-foreground">No correlated audit events found.</p>}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DisabledTerminal({ reason }: { reason: string }) {
  return (
    <Card className="mt-6">
      <CardContent className="flex min-h-72 flex-col items-center justify-center text-center">
        <span className="grid size-12 place-items-center rounded-full bg-muted"><SquareTerminal className="size-5 text-muted-foreground" /></span>
        <strong className="mt-4 text-base">Executable terminal is not exposed</strong>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{reason}</p>
        <p className="mt-3 max-w-xl text-xs leading-5 text-muted-foreground">A2A, Hermes, OpenClaw, and Deep Coding still share the same AgentInstance type. Terminal is a runtime capability; use the Logs tab for this Kubernetes-managed service.</p>
      </CardContent>
    </Card>
  );
}

export function A2aInstanceDetail({
  activeTab,
  canManage,
  canViewAuditLogs,
  canViewLogs,
  detail,
}: {
  activeTab: InstanceDetailTab;
  canManage: boolean;
  canViewAuditLogs: boolean;
  canViewLogs: boolean;
  detail: A2aStandardAgentInstanceDetail;
}) {
  const projectId = useCurrentProjectId();
  const scope = useProjectQueryScope();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const storedLogs = useQuery({
    queryKey: scope.key("agent-logs", detail.id),
    queryFn: () => api.getInstanceLogs(detail.id),
    enabled: canViewLogs,
    retry: 1,
    staleTime: 5_000,
  });
  const observedDetail: A2aStandardAgentInstanceDetail = {
    ...detail,
    instance: {
      ...detail.instance,
      logs: storedLogs.data?.logs ?? [],
      error: storedLogs.data?.error ?? null,
    },
  };
  const refresh = useMutation({
    mutationFn: () => api.discoverGardenAgent(detail.definition.id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: scope.key("agent", detail.id) }),
        queryClient.invalidateQueries({ queryKey: scope.key("agent-garden") }),
      ]);
    },
  });
  const remove = useMutation({
    mutationFn: () => api.removeGardenAgent(detail.definition.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: scope.key("agent-garden") });
      await navigate({ to: "/$projectId/instances", params: { projectId }, replace: true });
    },
  });
  const terminal = {
    enabled: false,
    disabledReason: detail.observability.terminal.reason ?? "This runtime does not expose an executable terminal.",
  };
  return (
    <div>
      <A2aHeader detail={observedDetail} canManage={canManage} refreshing={refresh.isPending} onRefresh={() => refresh.mutate()} onDelete={() => setDeleteOpen(true)} />
      <InstanceTabs active={activeTab} instanceId={detail.id} terminal={terminal} />
      {refresh.error instanceof Error ? <p role="alert" className="mt-4 border-l-2 border-destructive bg-destructive/5 px-4 py-3 text-sm text-destructive">{refresh.error.message}</p> : null}
      {activeTab === "overview" ? <A2aOverview detail={observedDetail} /> : null}
      {activeTab === "configuration" ? <A2aConfiguration detail={observedDetail} /> : null}
      {activeTab === "capabilities" ? <A2aCapabilities detail={observedDetail} /> : null}
      {activeTab === "activity" ? <AgentInstanceActivityTab detail={observedDetail} /> : null}
      {activeTab === "logs" ? <A2aLogs detail={observedDetail} canViewAuditLogs={canViewAuditLogs} canViewLogs={canViewLogs} /> : null}
      {activeTab === "terminal" ? <DisabledTerminal reason={terminal.disabledReason} /> : null}
      {canManage ? <DeleteInstanceSheet open={deleteOpen} onOpenChange={setDeleteOpen} instanceName={detail.name} deleting={remove.isPending} onConfirm={() => remove.mutate()} {...(remove.error instanceof Error ? { error: remove.error.message } : {})} /> : null}
    </div>
  );
}
