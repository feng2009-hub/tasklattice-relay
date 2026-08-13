import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { AgentCreationExperience } from "@/components/agents/agent-creation-experience";
import { DeleteInstanceDialog } from "@/components/instances/delete-instance-dialog";
import { InstanceAuditorLogTab } from "@/components/instances/instance-auditor-log-tab";
import { InstanceCapabilitiesTab } from "@/components/instances/instance-capabilities-tab";
import { InstanceConfigurationTab } from "@/components/instances/instance-configuration-tab";
import { InstanceHeader } from "@/components/instances/instance-detail-header";
import { instanceDetailTabSearchValues, getInstanceAccessState, normalizeInstanceDetailTab, resolveAvailableInstanceDetailTab } from "@/components/instances/instance-detail-model";
import { InstanceDetailErrorState, InstanceDetailSkeleton, InstanceNotFoundState } from "@/components/instances/instance-detail-states";
import { InstanceTabs } from "@/components/instances/instance-detail-tabs";
import { InstanceOverviewTab } from "@/components/instances/instance-overview-tab";
import { InstanceTerminalTab } from "@/components/instances/instance-terminal-tab";
import { ApiError, api } from "@/lib/api";
import { getAgentPlatformPresentation } from "@/lib/agent-platforms";
import { useProjectQueryScope } from "@/hooks/use-project-query-scope";
import { useProjectPermissions } from "@/hooks/use-project-permissions";
import { useEffect, useRef, useState } from "react";

const tabSearch = z.preprocess(
  (value) => typeof value === "string" && instanceDetailTabSearchValues.includes(value as (typeof instanceDetailTabSearchValues)[number]) ? value : undefined,
  z.enum(instanceDetailTabSearchValues).optional(),
);

export const Route = createFileRoute("/$projectId/instances/$instanceId")({
  validateSearch: z.object({ creating: z.boolean().optional(), tab: tabSearch }),
  component: AgentDetail,
});

function AgentDetail() {
  const { instanceId: agentId, projectId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const scope = useProjectQueryScope();
  const permissions = useProjectPermissions();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const activeTab = normalizeInstanceDetailTab(search.tab);

  const agent = useQuery({
    queryKey: scope.key("agent", agentId),
    queryFn: () => api.getAgent(agentId),
    retry: (failureCount, error) => !(error instanceof ApiError && error.status === 404) && failureCount < 2,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (activeTab === "terminal") return 5_000;
      if (status !== "PROVISIONING" && status !== "DESTROYING") return false;
      return typeof document !== "undefined" && document.visibilityState === "hidden" ? 15_000 : 5_000;
    },
  });
  const modelRouting = useQuery({
    queryKey: scope.key("model-routing", agent.data?.modelRoutingId),
    queryFn: () => api.getModelRouting(agent.data!.modelRoutingId),
    enabled: Boolean(agent.data?.modelRoutingId),
    retry: 1,
    staleTime: 30_000,
  });
  const interaction = useQuery({
    queryKey: scope.key("agent-interaction", agentId),
    queryFn: () => api.getAgentInteraction(agentId),
    enabled:
      permissions.canInteractWithAgents
      && agent.data?.status === "READY",
    retry: 1,
    staleTime: 15_000,
    refetchInterval: 4 * 60_000,
  });
  const runtimeLogs = useQuery({
    queryKey: scope.key("agent-logs", agentId),
    queryFn: () => api.getAgentLogs(agentId),
    enabled: permissions.canViewAgentLogs && Boolean(agent.data),
    retry: 1,
    staleTime: 5_000,
    refetchInterval:
      permissions.canViewAgentLogs
      && agent.data?.status === "PROVISIONING"
        ? 5_000
        : false,
  });
  const terminalTargets = useQuery({
    queryKey: scope.key("agent-terminal-targets", agentId),
    queryFn: () => api.getTerminalTargets(agentId),
    enabled:
      permissions.canUseAgentTerminal
      && agent.data?.status === "READY"
      && !search.creating,
    retry: 1,
    staleTime: 5_000,
    refetchInterval: activeTab === "terminal" ? 5_000 : false,
  });
  const audit = useQuery({
    queryKey: scope.key("agent-audit", agentId),
    queryFn: () => api.getAgentAudit(agentId),
    enabled:
      permissions.canViewSensitiveAgentAudit
      && Boolean(agent.data)
      && !search.creating,
    retry: 1,
    staleTime: 10_000,
  });
  const remove = useMutation({
    mutationFn: () => api.deleteAgent(agentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: scope.key("agents") });
      await navigate({ to: "/$projectId/instances", params: { projectId }, replace: true });
    },
  });
  const terminalWasOpen = useRef(false);
  const [terminalNotice, setTerminalNotice] = useState("");
  const interactionEndpoint = interaction.data?.httpEndpoint
    ?? (permissions.canInteractWithAgents
      && agent.data?.status === "READY"
      && agent.data.httpEndpoint?.status === "READY"
      ? {
          ...agent.data.httpEndpoint,
          reason: interaction.isError
            ? "Secure Web UI access could not be issued. Try refreshing this page."
            : "Preparing secure Web UI access…",
        }
      : undefined);
  const displayedAgent = agent.data
    ? {
        ...agent.data,
        ...(runtimeLogs.data
          ? {
              logs: runtimeLogs.data.logs,
              ...(runtimeLogs.data.error
                ? { error: runtimeLogs.data.error }
                : {}),
            }
          : {}),
        ...(interactionEndpoint ? { httpEndpoint: interactionEndpoint } : {}),
      }
    : undefined;
  const access = displayedAgent
    ? getInstanceAccessState(displayedAgent, terminalTargets.data, {
        canExecAgent: permissions.canUseAgentTerminal,
        checking:
          permissions.canUseAgentTerminal
          && displayedAgent.status === "READY"
          && terminalTargets.isPending,
        ...(terminalTargets.error
          ? {
              unavailableReason:
                "Terminal availability could not be verified.",
            }
          : {}),
      }, permissions.canInteractWithAgents)
    : undefined;

  useEffect(() => {
    if (!agent.data || !access || activeTab !== "terminal") return;
    if (access.terminal.enabled) {
      terminalWasOpen.current = true;
      return;
    }
    if (agent.data.status === "READY" && terminalTargets.isPending) return;
    if (terminalWasOpen.current)
      setTerminalNotice(
        "Terminal disconnected because the agent is no longer healthy.",
      );
    terminalWasOpen.current = false;
    void navigate({
      to: "/$projectId/instances/$instanceId",
      params: { projectId, instanceId: agentId },
      search: { tab: "overview" },
      replace: true,
    });
  }, [access, activeTab, agent.data, agentId, navigate, terminalTargets.isPending]);

  if (agent.isPending) return <InstanceDetailSkeleton />;
  if (agent.error instanceof ApiError && agent.error.status === 404) return <InstanceNotFoundState />;
  if (agent.isError || !agent.data) return <InstanceDetailErrorState onRetry={() => void agent.refetch()} />;
  if (search.creating) return <AgentCreationExperience agent={displayedAgent ?? agent.data} />;

  const platform = getAgentPlatformPresentation((displayedAgent ?? agent.data).agentPlatform);
  if (!access) return <InstanceDetailErrorState onRetry={() => void agent.refetch()} />;
  const visibleAgent = displayedAgent ?? agent.data;
  const renderedTab = resolveAvailableInstanceDetailTab(
    activeTab,
    access.terminal,
  );

  return (
    <div>
      <InstanceHeader access={access} agent={visibleAgent} canDelete={permissions.canDeleteAgents} platform={platform} onDelete={() => setDeleteOpen(true)} />
      <InstanceTabs active={renderedTab} agentId={agentId} terminal={access.terminal} />
      {terminalNotice ? <p role="status" className="mt-4 border-l-2 border-amber-500 bg-amber-500/5 px-4 py-3 text-sm">{terminalNotice}</p> : null}
      {renderedTab === "overview" ? <InstanceOverviewTab access={access} agent={visibleAgent} platform={platform} auditLoading={audit.isLoading} {...(audit.data ? { auditEvents: audit.data } : {})} {...(modelRouting.data?.name ? { modelRoutingName: modelRouting.data.name } : {})} /> : null}
      {renderedTab === "configuration" ? <InstanceConfigurationTab agent={visibleAgent} platform={platform} /> : null}
      {renderedTab === "capabilities" ? <InstanceCapabilitiesTab agent={visibleAgent} /> : null}
      {renderedTab === "terminal" ? <InstanceTerminalTab agent={visibleAgent} targets={(terminalTargets.data ?? []).filter((target) => target.available)} /> : null}
      {renderedTab === "auditor-log" ? (
        <InstanceAuditorLogTab
          agent={visibleAgent}
          includeSandboxAudit={permissions.canViewSensitiveAgentAudit}
        />
      ) : null}
      {permissions.canDeleteAgents ? <DeleteInstanceDialog open={deleteOpen} onOpenChange={setDeleteOpen} instanceName={visibleAgent.name} deleting={remove.isPending} onConfirm={() => remove.mutate()} {...(remove.error instanceof Error ? { error: remove.error.message } : {})} /> : null}
    </div>
  );
}
