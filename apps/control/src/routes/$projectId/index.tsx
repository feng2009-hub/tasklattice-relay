import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { AgentPlatformId, ProjectCapability } from "@tali/contracts";
import {
  ArrowRight,
  Bot,
  Boxes,
  BrainCircuit,
  CheckCircle2,
  Database,
  RefreshCw,
  ServerCog,
  Sparkles,
} from "lucide-react";
import { AgentPlatformIcon } from "@/components/agents/agent-platform-icon";
import { PageHeader } from "@/components/layout/page-header";
import { StatusDot } from "@/components/shared/status-dot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentProjectId, useProject } from "@/hooks/use-project";
import { useProjectPermissions } from "@/hooks/use-project-permissions";
import { useProjectQueryScope } from "@/hooks/use-project-query-scope";
import { api } from "@/lib/api";
import { agentPlatformPresentations } from "@/lib/agent-platforms";

export const Route = createFileRoute("/$projectId/")({ component: ProjectHome });

const catalogReadCapabilities = [
  "CAP_SKILL_VIEW",
  "CAP_MCP_SERVER_VIEW",
  "CAP_KNOWLEDGE_SOURCE_VIEW",
  "CAP_AGENT_SPECIALIZATION_VIEW",
] as const satisfies readonly ProjectCapability[];

const gardenReadCapabilities = [
  "CAP_AGENT_REGISTRATION_VIEW",
  "CAP_AGENT_CONNECTION_VIEW",
] as const satisfies readonly ProjectCapability[];

function ProjectHome() {
  const projectId = useCurrentProjectId();
  const { currentProject } = useProject();
  const permissions = useProjectPermissions();
  const scope = useProjectQueryScope();
  const granted = new Set(currentProject?.effectiveCapabilities ?? []);
  const canViewInstances = granted.has("CAP_AGENT_INSTANCE_CONFIG_VIEW");
  const canViewRuntime = granted.has("CAP_RUNTIME_OPERATION_VIEW");
  const canViewMemory =
    canViewInstances && granted.has("CAP_AGENT_MEMORY_CONFIG_VIEW");
  const canViewCatalog = catalogReadCapabilities.every((capability) =>
    granted.has(capability),
  );
  const canViewGarden = gardenReadCapabilities.every((capability) =>
    granted.has(capability),
  );

  const agents = useQuery({
    queryKey: scope.key("agents"),
    queryFn: api.listAgents,
    enabled: canViewInstances,
    refetchInterval: 10_000,
  });
  const runtime = useQuery({
    queryKey: scope.key("runtime-status"),
    queryFn: api.getRuntimeStatus,
    enabled: canViewRuntime,
    retry: 1,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
  const catalog = useQuery({
    queryKey: scope.key("resource-catalog"),
    queryFn: api.getResourceCatalog,
    enabled: canViewCatalog,
  });
  const garden = useQuery({
    queryKey: scope.key("agent-garden"),
    queryFn: api.getAgentGarden,
    enabled: canViewGarden,
  });

  const allInstances = agents.data ?? [];
  const openClawInstances = allInstances.filter(
    (instance) => instance.agentPlatform === "openclaw",
  );
  const memoryInstances = openClawInstances.filter(
    (instance) => Boolean(instance.memory),
  );
  const nativeMemory = memoryInstances.filter(
    (instance) => instance.memory?.mode === "native",
  ).length;
  const hybridMemory = memoryInstances.filter(
    (instance) => instance.memory?.mode === "hybrid",
  ).length;
  const readyMemory = memoryInstances.filter(
    (instance) => instance.status === "READY",
  ).length;
  const runtimeConnected =
    Boolean(runtime.data?.terminal.available) &&
    runtime.data?.terminal.transport !== "none";
  const publishedSkills =
    catalog.data?.skills.filter((skill) => skill.status === "PUBLISHED").length;
  const healthyMcpServers = catalog.data?.mcpServers.filter(
    (server) => server.status === "HEALTHY",
  ).length;
  const registeredKnowledge = catalog.data?.knowledgeSources.filter(
    (source) => source.status === "REGISTERED",
  ).length;
  const specialistAgents = garden.data?.agents.filter(
    (agent) =>
      agent.status === "READY" && agent.usageCapabilities.acceptsDelegation,
  ).length;
  const agentsUnavailable = agents.isError && !agents.data;
  const runtimeUnavailable = runtime.isError && !runtime.data;
  const catalogUnavailable = catalog.isError && !catalog.data;
  const gardenUnavailable = garden.isError && !garden.data;
  const queryErrors = [
    agents.error,
    runtime.error,
    catalog.error,
    garden.error,
  ].filter((error): error is Error => error instanceof Error);

  const retryQueries = () => {
    if (canViewInstances) void agents.refetch();
    if (canViewRuntime) void runtime.refetch();
    if (canViewCatalog) void catalog.refetch();
    if (canViewGarden) void garden.refetch();
  };

  return (
    <div className="space-y-7">
      <PageHeader
        title="Home"
        description="Prepare the Supervisor runtimes, capability supply, and experience continuity that let this Project carry human intent through."
        badge={<Badge variant="outline">Control plane</Badge>}
        actions={
          canViewInstances ? (
            <Button asChild className="h-11" variant="outline">
              <Link to="/$projectId/instances" params={{ projectId }}>
                <Boxes /> Review runtime instances
              </Link>
            </Button>
          ) : undefined
        }
      />

      <section
        aria-labelledby="project-operating-model"
        className="grid overflow-hidden rounded-lg border border-border/65 bg-muted/20 lg:grid-cols-[minmax(16rem,0.8fr)_minmax(0,1.2fr)]"
      >
        <div className="border-b p-5 lg:border-b-0 lg:border-r">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">
            Project operating model
          </p>
          <h2
            id="project-operating-model"
            className="mt-3 font-heading text-xl leading-snug"
          >
            Prepare the environment. Humans bring the intent.
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Administrators define the available execution boundary and tools;
            users choose or reuse a Supervisor when new work begins.
          </p>
        </div>
        <ol className="grid sm:grid-cols-3" aria-label="Project readiness layers">
          {[
            ["01", "Runtime profiles", "OpenClaw and Hermes implementations"],
            ["02", "Capability toolbox", "Specialists, Skills, MCP, and knowledge"],
            ["03", "Memory", "Experience retained inside each boundary"],
          ].map(([number, title, description], index) => (
            <li
              key={title}
              className="min-h-32 border-b p-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"
            >
              <span className="font-mono text-[10px] text-muted-foreground">
                {number}
              </span>
              <strong className="mt-5 block text-sm">{title}</strong>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                {description}
              </span>
              {index < 2 ? (
                <ArrowRight className="mt-3 hidden size-3.5 text-muted-foreground sm:block" />
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      {queryErrors.length ? (
        <div
          role="alert"
          className="flex flex-col gap-3 border-l-2 border-amber-500 bg-amber-500/5 px-4 py-3 text-sm sm:flex-row sm:items-center"
        >
          <span className="min-w-0 flex-1">
            Some Project status could not be loaded. Available sections remain usable.
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={retryQueries}>
            <RefreshCw /> Retry status
          </Button>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
        <Card>
          <CardHeader className="border-b">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ServerCog className="size-5 text-primary" /> Runtime profiles
                </CardTitle>
                <CardDescription className="mt-1 max-w-2xl">
                  Supported implementations for user-facing Supervisors, realized by
                  the Instances currently running in this Project.
                </CardDescription>
              </div>
              <StatusDot
                label={
                  !canViewRuntime
                    ? "Runtime visibility restricted"
                    : runtime.isPending
                      ? "Checking execution boundary"
                      : runtimeUnavailable
                        ? "Runtime status unavailable"
                        : runtimeConnected
                          ? "Execution boundary connected"
                          : "Execution boundary unavailable"
                }
                tone={
                  !canViewRuntime || runtime.isPending
                    ? "neutral"
                    : runtimeUnavailable
                      ? "danger"
                      : runtimeConnected
                        ? "success"
                        : "warning"
                }
              />
            </div>
          </CardHeader>
          <CardContent className="divide-y px-0">
            {agentPlatformPresentations.map((platform) => (
              <RuntimeProfileRow
                key={platform.id}
                platform={platform}
                instances={allInstances.filter(
                  (instance) => instance.agentPlatform === platform.id,
                ).length}
                ready={allInstances.filter(
                  (instance) =>
                    instance.agentPlatform === platform.id &&
                    instance.status === "READY",
                ).length}
                loading={canViewInstances && agents.isPending}
                unavailable={agentsUnavailable}
                canCreate={permissions.canCreateAgents}
                canView={canViewInstances}
                projectId={projectId}
              />
            ))}
          </CardContent>
          {canViewInstances ? (
            <CardFooter className="justify-between gap-3 text-xs text-muted-foreground">
              <span>Runtime details remain backed by the existing flat Instance API.</span>
              <Button asChild variant="ghost" size="sm">
                <Link to="/$projectId/instances" params={{ projectId }}>
                  All instances <ArrowRight />
                </Link>
              </Button>
            </CardFooter>
          ) : null}
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <BrainCircuit className="size-5 text-primary" /> Memory
            </CardTitle>
            <CardDescription>
              Experience continuity for OpenClaw, isolated inside each Instance.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {!canViewMemory ? (
              <RestrictedSummary description="Memory configuration is visible to Project operators with Instance configuration access." />
            ) : agents.isPending ? (
              <div className="space-y-3" aria-label="Loading Memory summary">
                <Skeleton className="h-16 w-32" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : agentsUnavailable ? (
              <RestrictedSummary
                title="Memory status unavailable"
                description="The Instance-backed Memory summary could not be loaded. Retry Project status to check again."
              />
            ) : (
              <>
                <div>
                  <strong className="font-heading text-4xl font-normal tabular-nums">
                    {memoryInstances.length}
                  </strong>
                  <p className="mt-1 text-xs text-muted-foreground">
                    of {openClawInstances.length} OpenClaw Instance
                    {openClawInstances.length === 1 ? "" : "s"} retain memory
                  </p>
                </div>
                <dl className="divide-y border-y text-xs">
                  {[
                    ["Native notes", nativeMemory],
                    ["Hybrid recall", hybridMemory],
                    ["Ready now", readyMemory],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="flex min-h-11 items-center justify-between gap-3"
                    >
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="font-medium tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="text-xs leading-5 text-muted-foreground">
                  Memory preserves context without expanding Agent authority; Access
                  and Runtime Policies continue to define the boundary.
                </p>
              </>
            )}
          </CardContent>
          {canViewMemory ? (
            <CardFooter className="justify-end">
              <Button asChild variant="ghost" size="sm">
                <Link to="/$projectId/memory" params={{ projectId }}>
                  Review Memory <ArrowRight />
                </Link>
              </Button>
            </CardFooter>
          ) : null}
        </Card>
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Capability readiness</CardTitle>
          <CardDescription>
            Flat Project resources that a future Routine can discover and combine for
            the Supervisor handling the current intent.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-0 px-0 sm:grid-cols-2 xl:grid-cols-4">
          <CapabilityLink
            icon={Bot}
            label="Specialist Agents"
            value={specialistAgents}
            loading={canViewGarden && garden.isPending}
            restricted={!canViewGarden}
            unavailable={gardenUnavailable}
            to="/$projectId/agent-garden"
            projectId={projectId}
          />
          <CapabilityLink
            icon={Sparkles}
            label="Published Skills"
            value={publishedSkills}
            loading={canViewCatalog && catalog.isPending}
            restricted={!canViewCatalog}
            unavailable={catalogUnavailable}
            to="/$projectId/skills"
            projectId={projectId}
          />
          <CapabilityLink
            icon={Database}
            label="Healthy MCP connections"
            value={healthyMcpServers}
            loading={canViewCatalog && catalog.isPending}
            restricted={!canViewCatalog}
            unavailable={catalogUnavailable}
            to="/$projectId/mcp-servers"
            projectId={projectId}
          />
          <CapabilityLink
            icon={CheckCircle2}
            label="Registered knowledge"
            value={registeredKnowledge}
            loading={canViewCatalog && catalog.isPending}
            restricted={!canViewCatalog}
            unavailable={catalogUnavailable}
            to="/$projectId/knowledge-base"
            projectId={projectId}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function RuntimeProfileRow({
  canCreate,
  canView,
  instances,
  loading,
  platform,
  projectId,
  ready,
  unavailable,
}: {
  canCreate: boolean;
  canView: boolean;
  instances: number;
  loading: boolean;
  platform: (typeof agentPlatformPresentations)[number];
  projectId: string;
  ready: number;
  unavailable: boolean;
}) {
  return (
    <div className="grid gap-4 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
      <AgentPlatformIcon platform={platform} />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <strong>{platform.name}</strong>
          <Badge variant="outline">Supported runtime</Badge>
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {platform.description}
        </p>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          NemoClaw configuration · OpenShell sandbox
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
        {loading ? (
          <Skeleton className="h-5 w-24" />
        ) : (
          <StatusDot
            label={
              !canView
                ? "Instance visibility restricted"
                : unavailable
                  ? "Instance status unavailable"
                  : instances
                    ? `${instances} Instance${instances === 1 ? "" : "s"} · ${ready} ready`
                    : "No Instances"
            }
            tone={
              unavailable
                ? "danger"
                : !canView || !instances
                  ? "neutral"
                  : ready
                    ? "success"
                    : "warning"
            }
          />
        )}
        {canCreate ? (
          <Button asChild variant="ghost" size="sm">
            <Link
              to="/$projectId/instances"
              params={{ projectId }}
              search={{ create: "instance", platform: platform.id as AgentPlatformId }}
            >
              Create Instance <ArrowRight />
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function RestrictedSummary({
  description,
  title = "Project visibility restricted",
}: {
  description: string;
  title?: string;
}) {
  return (
    <div className="rounded-md border border-dashed bg-muted/25 p-4">
      <strong className="text-xs">{title}</strong>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
    </div>
  );
}

type CapabilityRoute =
  | "/$projectId/agent-garden"
  | "/$projectId/knowledge-base"
  | "/$projectId/mcp-servers"
  | "/$projectId/skills";

function CapabilityLink({
  icon: Icon,
  label,
  loading,
  projectId,
  restricted,
  to,
  unavailable,
  value,
}: {
  icon: typeof Bot;
  label: string;
  loading: boolean;
  projectId: string;
  restricted: boolean;
  to: CapabilityRoute;
  unavailable: boolean;
  value: number | undefined;
}) {
  const content = (
    <>
      <span className="grid size-9 place-items-center rounded-md bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-sm">{label}</strong>
        <span className="mt-1 block text-xs text-muted-foreground">
          {restricted
            ? "Visibility restricted"
            : unavailable
              ? "Status unavailable"
              : "Available to the Project"}
        </span>
      </span>
      {loading ? (
        <Skeleton className="h-8 w-10" />
      ) : (
        <span className="font-heading text-2xl tabular-nums text-foreground">
          {restricted || unavailable ? "—" : (value ?? 0)}
        </span>
      )}
    </>
  );

  if (restricted) {
    return (
      <div className="flex min-h-24 items-center gap-3 border-b p-4 last:border-b-0 sm:border-r sm:even:border-r-0 xl:border-b-0 xl:even:border-r xl:last:border-r-0">
        {content}
      </div>
    );
  }

  return (
    <Link
      to={to}
      params={{ projectId }}
      className="group flex min-h-24 items-center gap-3 border-b p-4 transition-colors last:border-b-0 hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-offset-[-2px] sm:border-r sm:even:border-r-0 xl:border-b-0 xl:even:border-r xl:last:border-r-0"
    >
      {content}
    </Link>
  );
}
