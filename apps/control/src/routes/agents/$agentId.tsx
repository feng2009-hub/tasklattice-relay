import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { z } from "zod";
import { AgentCreationExperience } from "@/components/agents/agent-creation-experience";
import { DeleteInstanceDialog } from "@/components/instances/delete-instance-dialog";
import { InstanceActivityTab } from "@/components/instances/instance-activity-tab";
import { InstanceCapabilitiesTab } from "@/components/instances/instance-capabilities-tab";
import { InstanceConfigurationTab } from "@/components/instances/instance-configuration-tab";
import { InstanceHeader } from "@/components/instances/instance-detail-header";
import { instanceDetailTabs, getInstanceAccessState, normalizeInstanceDetailTab } from "@/components/instances/instance-detail-model";
import { InstanceDetailErrorState, InstanceDetailSkeleton, InstanceNotFoundState } from "@/components/instances/instance-detail-states";
import { InstanceTabs } from "@/components/instances/instance-detail-tabs";
import { InstanceOverviewTab } from "@/components/instances/instance-overview-tab";
import { InstanceRuntimeTab } from "@/components/instances/instance-runtime-tab";
import { ApiError, api } from "@/lib/api";
import { getAgentPlatformPresentation } from "@/lib/agent-platforms";
import { useState } from "react";

const tabSearch = z.preprocess(
  (value) => typeof value === "string" && instanceDetailTabs.includes(value as (typeof instanceDetailTabs)[number]) ? value : undefined,
  z.enum(instanceDetailTabs).optional(),
);

export const Route = createFileRoute("/agents/$agentId")({
  validateSearch: z.object({ creating: z.boolean().optional(), tab: tabSearch }),
  component: AgentDetail,
});

function AgentDetail() {
  const { agentId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const locationHash = useRouterState({ select: (state) => state.location.hash });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const activeTab = normalizeInstanceDetailTab(search.tab);

  const agent = useQuery({
    queryKey: ["agent", agentId],
    queryFn: () => api.getAgent(agentId),
    retry: (failureCount, error) => !(error instanceof ApiError && error.status === 404) && failureCount < 2,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status !== "PROVISIONING" && status !== "DESTROYING") return false;
      return typeof document !== "undefined" && document.visibilityState === "hidden" ? 15_000 : 5_000;
    },
  });
  const runtime = useQuery({
    queryKey: ["runtime-status"],
    queryFn: api.getRuntimeStatus,
    enabled: agent.data?.status === "READY" && !search.creating,
    retry: 1,
    staleTime: 5_000,
  });
  const audit = useQuery({
    queryKey: ["agent-audit", agentId],
    queryFn: () => api.getAgentAudit(agentId),
    enabled: Boolean(agent.data) && !search.creating,
    retry: 1,
    staleTime: 10_000,
  });
  const remove = useMutation({
    mutationFn: () => api.deleteAgent(agentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["agents"] });
      await navigate({ to: "/instances", replace: true });
    },
  });

  if (agent.isPending) return <InstanceDetailSkeleton />;
  if (agent.error instanceof ApiError && agent.error.status === 404) return <InstanceNotFoundState />;
  if (agent.isError || !agent.data) return <InstanceDetailErrorState onRetry={() => void agent.refetch()} />;
  if (search.creating) return <AgentCreationExperience agent={agent.data} />;

  const platform = getAgentPlatformPresentation(agent.data.agentPlatform);
  const access = getInstanceAccessState(agent.data, runtime.data);
  const auditError = audit.error instanceof Error ? audit.error.message : undefined;
  const runtimeError = runtime.error instanceof Error ? runtime.error.message : undefined;
  const showLogs = locationHash === "provisioning-logs" || locationHash === "#provisioning-logs";

  return (
    <div>
      <InstanceHeader access={access} agent={agent.data} platform={platform} onDelete={() => setDeleteOpen(true)} />
      <InstanceTabs active={activeTab} agentId={agentId} />
      {activeTab === "overview" ? <InstanceOverviewTab access={access} agent={agent.data} platform={platform} auditLoading={audit.isLoading} {...(audit.data ? { auditEvents: audit.data } : {})} {...(runtime.data ? { runtime: runtime.data } : {})} /> : null}
      {activeTab === "configuration" ? <InstanceConfigurationTab agent={agent.data} platform={platform} /> : null}
      {activeTab === "capabilities" ? <InstanceCapabilitiesTab agent={agent.data} /> : null}
      {activeTab === "runtime" ? <InstanceRuntimeTab access={access} agent={agent.data} platform={platform} runtimeChecking={runtime.isFetching} onRecheckRuntime={() => void runtime.refetch()} {...(runtime.data ? { runtime: runtime.data } : {})} {...(runtimeError ? { runtimeError } : {})} /> : null}
      {activeTab === "activity" ? <InstanceActivityTab agent={agent.data} auditLoading={audit.isLoading} showLogs={showLogs} {...(audit.data ? { auditEvents: audit.data } : {})} {...(auditError ? { auditError } : {})} /> : null}
      <DeleteInstanceDialog open={deleteOpen} onOpenChange={setDeleteOpen} instanceName={agent.data.name} deleting={remove.isPending} onConfirm={() => remove.mutate()} {...(remove.error instanceof Error ? { error: remove.error.message } : {})} />
    </div>
  );
}
