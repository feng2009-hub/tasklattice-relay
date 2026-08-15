import { useMemo, useState, type ReactElement } from "react";
import {
  agentPlatformIds,
  type Agent,
  type AgentStatus,
} from "@tali/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { AlertTriangle, Boxes, Eye, Globe2, Info, MoreHorizontal, Plus, RefreshCw, Search, SquareTerminal, Trash2, X } from "lucide-react";
import { AgentPlatformIcon } from "@/components/agents/agent-platform-icon";
import { CreateInstanceSheet } from "@/components/agents/create-instance-sheet";
import { resolveProvisioningState } from "@/components/agents/provisioning-state";
import { DeleteInstanceDialog } from "@/components/instances/delete-instance-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import { getAgentPlatformPresentation } from "@/lib/agent-platforms";
import { cn } from "@/lib/utils";
import { formatPlatformDate } from "@/lib/platform-preferences";
import { useProjectQueryScope } from "@/hooks/use-project-query-scope";
import { useCurrentProjectId } from "@/hooks/use-project";
import { useProjectPermissions } from "@/hooks/use-project-permissions";

export const Route = createFileRoute("/$projectId/instances/")({
  validateSearch: z.object({
    create: z.literal("instance").optional(),
    created: z.string().optional(),
    platform: z.enum(agentPlatformIds).optional(),
    specialization: z.string().trim().min(1).max(64).optional(),
  }),
  component: Instances,
});

const statusFilters = ["ALL", "PROVISIONING", "READY", "FAILED", "DESTROYING"] as const satisfies readonly (AgentStatus | "ALL")[];

function creatorInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0]![0]}${parts.at(-1)![0]}` : displayName.slice(0, 2)).toUpperCase();
}

function relativeTime(value: string): string {
  const elapsed = Date.now() - new Date(value).getTime();
  if (elapsed < 60_000) return "Less than a minute ago";
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return formatPlatformDate(value);
}

function CreationNotice({ onClose }: { onClose: () => void }) {
  return (
    <div role="status" className="flex min-h-16 items-center gap-3 rounded-md border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"><Info className="size-4" /></span>
      <p className="min-w-0 flex-1"><strong>Creation request submitted.</strong> The Instance is being created in the background.</p>
      <button type="button" aria-label="Dismiss creation notice" onClick={onClose} className="grid size-11 shrink-0 place-items-center rounded-md text-primary hover:bg-primary/10 focus-visible:outline-2"><X className="size-5" /></button>
    </div>
  );
}

function InstanceLifecycleStatus({ instance }: { instance: Agent }) {
  const projectId = useCurrentProjectId();
  if (instance.status === "READY") {
    return <Badge className="gap-2 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300"><span className="size-2 rounded-full bg-emerald-500" />Ready</Badge>;
  }
  if (instance.status === "FAILED") {
    return (
      <Link to="/$projectId/instances/$instanceId" params={{ projectId, instanceId: instance.id }} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-destructive/25 bg-destructive/5 px-3 text-xs font-medium text-destructive hover:bg-destructive/10 focus-visible:outline-2">
        <AlertTriangle className="size-4" />Failed<span className="sr-only"> — view failure details</span>
      </Link>
    );
  }
  if (instance.status === "DESTROYING") {
    return <span className="inline-flex min-h-11 items-center gap-2 rounded-md bg-muted px-3 text-xs font-medium"><Spinner className="size-4" />Removing</span>;
  }

  const state = resolveProvisioningState({ status: instance.status, ...(instance.provisioningStage ? { stage: instance.provisioningStage } : {}) });
  const step = Math.min(5, Math.max(1, state.activeIndex));
  return (
    <Link to="/$projectId/instances/$instanceId" params={{ projectId, instanceId: instance.id }} className="inline-flex min-h-11 flex-col justify-center rounded-md border border-primary/20 bg-primary/5 px-3 text-xs hover:bg-primary/10 focus-visible:outline-2">
      <span className="flex items-center gap-2 font-medium text-foreground"><Spinner className="size-4 text-primary" />Creating · {step}/5</span>
      <span className="mt-0.5 pl-6 tabular-nums text-muted-foreground">{state.progress}% complete</span>
    </Link>
  );
}

function ActionTooltip({ children, label }: { children: ReactElement; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild><span className="inline-flex">{children}</span></TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>{label}</TooltipContent>
    </Tooltip>
  );
}

function PrimaryInstanceAction({ canInteract, instance }: { canInteract: boolean; instance: Agent }) {
  const projectId = useCurrentProjectId();
  const platform = getAgentPlatformPresentation(instance.agentPlatform);
  const scope = useProjectQueryScope();
  const interaction = useQuery({
    queryKey: scope.key("agent-interaction", instance.id),
    queryFn: () => api.getAgentInteraction(instance.id),
    enabled: canInteract && instance.status === "READY",
    retry: 1,
    staleTime: 15_000,
    refetchInterval: 4 * 60_000,
  });
  const endpoint = interaction.data?.httpEndpoint;
  const endpointReady = endpoint?.status === "READY" && Boolean(endpoint.url);

  if (instance.status === "READY" && endpointReady && endpoint?.url) {
    return (
      <ActionTooltip label={`Open ${platform.endpointLabel}`}>
        <Button asChild variant="outline" size="icon">
          <a href={endpoint.url} target="_blank" rel="noreferrer" aria-label={`Open ${platform.endpointLabel} for ${instance.name}`}>
            <Globe2 className="size-[18px]" />
          </a>
        </Button>
      </ActionTooltip>
    );
  }
  if (instance.status === "FAILED") {
    return (
      <ActionTooltip label="View failure details">
        <Button asChild variant="outline" size="icon">
          <Link to="/$projectId/instances/$instanceId" params={{ projectId, instanceId: instance.id }} aria-label={`View failure details for ${instance.name}`}>
            <AlertTriangle className="size-[18px]" />
          </Link>
        </Button>
      </ActionTooltip>
    );
  }
  return (
    <ActionTooltip label="View Instance details">
      <Button asChild variant="outline" size="icon">
        <Link to="/$projectId/instances/$instanceId" params={{ projectId, instanceId: instance.id }} aria-label={`View details for ${instance.name}`}>
          <Eye className="size-[18px]" />
        </Link>
      </Button>
    </ActionTooltip>
  );
}

function InstanceActions({ canDelete, canUseTerminal, instance, onDelete }: { canDelete: boolean; canUseTerminal: boolean; instance: Agent; onDelete: () => void }) {
  const projectId = useCurrentProjectId();
  const platform = getAgentPlatformPresentation(instance.agentPlatform);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Actions for ${instance.name}`}><MoreHorizontal className="size-5" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild><Link to="/$projectId/instances/$instanceId" params={{ projectId, instanceId: instance.id }}><Eye />View details</Link></DropdownMenuItem>
        {canUseTerminal && instance.status === "READY" ? <DropdownMenuItem asChild><Link to="/$projectId/instances/$instanceId" params={{ projectId, instanceId: instance.id }} search={{ tab: "terminal" }}><SquareTerminal />Open {platform.consoleLabel}</Link></DropdownMenuItem> : null}
        <DropdownMenuItem disabled><RefreshCw />Restart unavailable</DropdownMenuItem>
        {canDelete ? <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          disabled={instance.status === "DESTROYING"}
          onSelect={onDelete}
        >
          <Trash2 />
          {instance.status === "DESTROYING"
            ? "Deletion in progress"
            : "Delete Instance"}
        </DropdownMenuItem> : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Instances() {
  const projectId = useCurrentProjectId();
  const queryClient = useQueryClient();
  const scope = useProjectQueryScope();
  const permissions = useProjectPermissions();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof statusFilters)[number]>("ALL");
  const [deletingInstance, setDeletingInstance] = useState<Agent>();
  const agents = useQuery({ queryKey: scope.key("agents"), queryFn: api.listAgents, refetchInterval: 2_000 });
  const filtered = useMemo(() => (agents.data ?? []).filter((agent) => {
    const matchesQuery = `${agent.name} ${agent.id} ${agent.sandboxName} ${getAgentPlatformPresentation(agent.agentPlatform).name} ${agent.createdBy?.displayName ?? ""} ${agent.createdBy?.username ?? ""}`.toLowerCase().includes(query.trim().toLowerCase());
    return matchesQuery && (status === "ALL" || agent.status === status);
  }), [agents.data, query, status]);
  const remove = useMutation({
    mutationFn: api.deleteAgent,
    onSuccess: async () => {
      setDeletingInstance(undefined);
      await queryClient.invalidateQueries({ queryKey: scope.key("agents") });
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Instances" description="View and manage your Agent instances. Start new instances and monitor their status." actions={permissions.canCreateAgents ? <Button asChild className="h-11"><Link to="/$projectId/instances" params={{ projectId }} search={{ create: "instance" }}><Plus />Create Instance</Link></Button> : undefined} />

      {search.created ? <CreationNotice onClose={() => void navigate({ to: "/$projectId/instances", params: { projectId }, search: {}, replace: true })} /> : null}

      <TooltipProvider>
      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-center gap-3">
            <label className="w-full sm:w-72">
              <span className="sr-only">Search instances</span>
              <InputGroup className="h-11 rounded-md">
                <InputGroupAddon><Search className="size-4" /></InputGroupAddon>
                <InputGroupInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search instances" />
              </InputGroup>
            </label>
            <Select value={status} onValueChange={(value) => setStatus(value as (typeof statusFilters)[number])}>
              <SelectTrigger size="lg" aria-label="Filter Instances by status" className="w-[calc(100%-3.5rem)] sm:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>{statusFilters.map((value) => <SelectItem key={value} value={value}>{value === "ALL" ? "All statuses" : value.charAt(0) + value.slice(1).toLowerCase()}</SelectItem>)}</SelectContent>
            </Select>
            <span className="ml-auto hidden text-xs tabular-nums text-muted-foreground sm:block">{filtered.length} of {(agents.data ?? []).length} Instances</span>
            <ActionTooltip label={agents.isFetching ? "Refreshing Instances" : "Refresh Instances"}>
              <Button type="button" variant="outline" size="icon" className="size-11" disabled={agents.isFetching} aria-label="Refresh Instances" onClick={() => void agents.refetch()}>
                {agents.isFetching ? <Spinner /> : <RefreshCw className="size-4" />}
              </Button>
            </ActionTooltip>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {filtered.length ? (
            <>
              <div className="hidden grid-cols-[minmax(13rem,1.3fr)_minmax(9rem,.9fr)_minmax(9rem,.75fr)_8rem_9rem_3.5rem_3rem] items-center gap-3 border-b bg-muted/20 px-4 py-3 text-xs text-muted-foreground xl:grid">
                <span>Instance</span><span>Runtime</span><span>Created by</span><span>Updated</span><span>Status</span><span>Access</span><span className="sr-only">Actions</span>
              </div>
              {filtered.map((agent) => {
                const platform = getAgentPlatformPresentation(agent.agentPlatform);
                return (
                  <div key={agent.id} className={cn(
                    "group relative grid min-h-[5.25rem] grid-cols-[minmax(0,1fr)_2.75rem_2.75rem] items-center gap-3 border-b px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-muted/30 xl:grid-cols-[minmax(13rem,1.3fr)_minmax(9rem,.9fr)_minmax(9rem,.75fr)_8rem_9rem_3.5rem_3rem]",
                    search.created === agent.id && "bg-primary/5 shadow-[inset_3px_0_0_var(--primary)]",
                  )}>
                    <Link to="/$projectId/instances/$instanceId" params={{ projectId, instanceId: agent.id }} aria-label={`View details for ${agent.name}`} className="absolute inset-0 z-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px]" />
                    <span className="pointer-events-none relative z-10 col-span-3 flex min-w-0 items-center gap-3 xl:col-span-1">
                      <AgentPlatformIcon platform={platform} className="transition-colors group-hover:border-primary/30 group-hover:bg-primary/5" />
                      <span className="min-w-0">
                        <Link to="/$projectId/instances/$instanceId" params={{ projectId, instanceId: agent.id }} className="pointer-events-auto block truncate font-medium text-foreground hover:text-primary hover:underline">{agent.name}</Link>
                        <span className="mt-1 block truncate font-mono text-xs text-muted-foreground">{agent.id.slice(0, 8)} · {platform.name}</span>
                        <span className="mt-1 block truncate text-xs text-muted-foreground xl:hidden">Created by {agent.createdBy?.displayName ?? "Unknown user"}</span>
                      </span>
                    </span>
                    <span className="pointer-events-none relative z-10 hidden min-w-0 xl:block"><strong className="block truncate text-xs font-medium">{platform.runtimeName}</strong><span className="mt-1 block truncate font-mono text-xs text-muted-foreground">{agent.sandboxName}</span></span>
                    <span className="pointer-events-none relative z-10 hidden min-w-0 items-center gap-2 xl:flex">
                      <Avatar className="size-7 border">
                        <AvatarFallback className="text-[10px] font-medium">{creatorInitials(agent.createdBy?.displayName ?? "Unknown")}</AvatarFallback>
                      </Avatar>
                      <span className="min-w-0">
                        <strong className="block truncate text-xs font-medium">{agent.createdBy?.displayName ?? "Unknown user"}</strong>
                        <span className="mt-1 block truncate text-xs text-muted-foreground">{agent.createdBy ? `@${agent.createdBy.username}` : "Creator unavailable"}</span>
                      </span>
                    </span>
                    <span className="pointer-events-none relative z-10 hidden text-xs text-muted-foreground xl:block">{relativeTime(agent.updatedAt)}</span>
                    <span className="relative z-20" onClick={(event) => event.stopPropagation()}><InstanceLifecycleStatus instance={agent} /></span>
                    <span className="relative z-20 justify-self-end lg:justify-self-start" onClick={(event) => event.stopPropagation()}><PrimaryInstanceAction canInteract={permissions.canInteractWithAgents} instance={agent} /></span>
                    <span className="relative z-20 justify-self-end" onClick={(event) => event.stopPropagation()}><InstanceActions canDelete={permissions.canDeleteAgents} canUseTerminal={permissions.canUseAgentTerminal} instance={agent} onDelete={() => setDeletingInstance(agent)} /></span>
                  </div>
                );
              })}
            </>
          ) : agents.data?.length ? (
            <EmptyState
              icon={Boxes}
              title="No matching instances"
              description="Adjust the search or status filter."
            />
          ) : (
            <EmptyState
              icon={Boxes}
              title="No Instances yet"
              description="Create an Instance to start running an Agent in this Project."
              action={permissions.canCreateAgents ? (
                <Button asChild>
                  <Link
                    to="/$projectId/instances"
                    params={{ projectId }}
                    search={{ create: "instance" }}
                  >
                    <Plus />
                    Create Instance
                  </Link>
                </Button>
              ) : undefined}
            />
          )}
        </CardContent>
      </Card>
      </TooltipProvider>

      {permissions.canDeleteAgents && deletingInstance ? <DeleteInstanceDialog open instanceName={deletingInstance.name} deleting={remove.isPending} onOpenChange={(open) => { if (!open) setDeletingInstance(undefined); }} onConfirm={() => remove.mutate(deletingInstance.id)} {...(remove.error instanceof Error ? { error: remove.error.message } : {})} /> : null}
      {permissions.canCreateAgents && search.create === "instance" ? (
        <CreateInstanceSheet
          open
          {...(search.platform ? { initialAgentPlatform: search.platform } : {})}
          {...(search.specialization ? { initialSpecializationId: search.specialization } : {})}
          onOpenChange={(open) => {
            if (open) return;
            void navigate({
              to: "/$projectId/instances",
              params: { projectId },
              search: search.created ? { created: search.created } : {},
              replace: true,
            });
          }}
        />
      ) : null}
    </div>
  );
}
