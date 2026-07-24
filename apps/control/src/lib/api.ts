import type {
  Agent,
  CreateKnowledgeSourceDefinitionInput,
  CreateAgentInput,
  CostQueryParams,
  ModelCostActivityResponse,
  ModelCostBreakdownResponse,
  ModelCostDataQualityResponse,
  ModelCostGranularity,
  ModelCostInsightsResponse,
  ModelCostRankingResponse,
  ModelCostSortDirection,
  ModelCostSummaryResponse,
  ModelCostTrendGranularity,
  ModelCostTrendResponse,
  CreateMcpServerDefinitionInput,
  CreateModelDeploymentInput,
  CreateProviderConnectionInput,
  CreateSandboxPolicyInput,
  CreateSkillDefinitionInput,
  ExtensionCatalog,
  ExtensionResourceKind,
  KnowledgeSourceDefinition,
  InferenceGateway,
  ModelProfile,
  ModelProfileAuditEvent,
  ModelProfileConsumer,
  CreateModelProfileInput,
  UpdateModelProfileInput,
  McpServerDefinition,
  ModelDeployment,
  ProviderAccount,
  ProviderConnectionCreationResult,
  ProviderConnectionDraft,
  ProviderDiscoveryResult,
  RuntimeStatus,
  SandboxPolicy,
  SandboxPolicyCatalog,
  SandboxAuditEvent,
  TerminalSessionResponse,
  TerminalTarget,
  SkillDefinition,
  UpdateKnowledgeSourceDefinitionInput,
  UpdateMcpServerDefinitionInput,
  UpdateSkillDefinitionInput,
  VirtualEmployee,
  CreateVirtualEmployeeInput,
  UpdateVirtualEmployeeInput,
  IdentityBindingInput,
  AccessScopeBindingInput,
  VirtualEmployeeSpend,
  VirtualEmployeeAuditEvent,
} from "@tasklattice/contracts";
import { clearAuthToken, getAuthToken } from "./auth-token";
import { projectIdFromPathname } from "./project-storage";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

export function projectScopedPath(path: string, projectId: string | null): string {
  if (!projectId) return path;
  const url = new URL(path, "http://tasklattice.local");
  const suffix = url.pathname
    .replace(/^\/api\/v1\/projects\/[^/]+\/?/, "")
    .replace(/^\/api\/v1\/?/, "");
  return `/api/v1/projects/${encodeURIComponent(projectId)}/${suffix}${url.search}${url.hash}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const projectId =
    typeof window === "undefined"
      ? null
      : projectIdFromPathname(window.location.pathname);
  const response = await fetch(projectScopedPath(path, projectId), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  const payload = (await response.json()) as T | { error: string };
  if (response.status === 401 && typeof window !== "undefined") {
    clearAuthToken();
    window.location.assign("/login");
  }
  if (!response.ok)
    throw new ApiError(
      "error" in (payload as object) && typeof (payload as { error?: unknown }).error === "string"
        ? (payload as { error: string }).error
        : `Request failed (${response.status})`,
      response.status,
    );
  return payload as T;
}

function costSearch(params: CostQueryParams, extra: Record<string, string> = {}) {
  return new URLSearchParams({
    start_time: params.startTime,
    end_time: params.endTime,
    timezone: params.timezone,
    filters: JSON.stringify(params.filters),
    ...extra,
  });
}

export const api = {
  listVirtualEmployees: async () =>
    (await request<{ data: VirtualEmployee[] }>("/api/v1/virtual-employees")).data,
  getVirtualEmployee: (id: string) =>
    request<VirtualEmployee>(`/api/v1/virtual-employees/${encodeURIComponent(id)}`),
  createVirtualEmployee: (input: CreateVirtualEmployeeInput) =>
    request<VirtualEmployee>("/api/v1/virtual-employees", { method: "POST", body: JSON.stringify(input) }),
  updateVirtualEmployee: (id: string, input: UpdateVirtualEmployeeInput) =>
    request<VirtualEmployee>(`/api/v1/virtual-employees/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) }),
  deleteVirtualEmployee: (id: string) =>
    request<void>(`/api/v1/virtual-employees/${encodeURIComponent(id)}`, { method: "DELETE" }),
  provisionVirtualEmployee: (id: string) =>
    request<VirtualEmployee>(`/api/v1/virtual-employees/${encodeURIComponent(id)}/provision`, { method: "POST", body: "{}" }),
  suspendVirtualEmployee: (id: string) =>
    request<VirtualEmployee>(`/api/v1/virtual-employees/${encodeURIComponent(id)}/suspend`, { method: "POST", body: "{}" }),
  activateVirtualEmployee: (id: string) =>
    request<VirtualEmployee>(`/api/v1/virtual-employees/${encodeURIComponent(id)}/activate`, { method: "POST", body: "{}" }),
  rotateVirtualEmployeeCredential: (id: string) =>
    request<VirtualEmployee>(`/api/v1/virtual-employees/${encodeURIComponent(id)}/rotate-model-credential`, { method: "POST", body: "{}" }),
  syncVirtualEmployee: (id: string, apply = false) =>
    request<VirtualEmployee>(`/api/v1/virtual-employees/${encodeURIComponent(id)}/sync`, { method: "POST", body: JSON.stringify({ apply }) }),
  attachVirtualEmployeeIdentity: (id: string, input: IdentityBindingInput) =>
    request<VirtualEmployee>(`/api/v1/virtual-employees/${encodeURIComponent(id)}/identities`, { method: "POST", body: JSON.stringify(input) }),
  detachVirtualEmployeeIdentity: (id: string, bindingId: string) =>
    request<void>(`/api/v1/virtual-employees/${encodeURIComponent(id)}/identities/${encodeURIComponent(bindingId)}`, { method: "DELETE" }),
  attachVirtualEmployeeScope: (id: string, input: AccessScopeBindingInput) =>
    request<VirtualEmployee>(`/api/v1/virtual-employees/${encodeURIComponent(id)}/access-scopes`, { method: "POST", body: JSON.stringify(input) }),
  detachVirtualEmployeeScope: (id: string, scopeId: string) =>
    request<void>(`/api/v1/virtual-employees/${encodeURIComponent(id)}/access-scopes/${encodeURIComponent(scopeId)}`, { method: "DELETE" }),
  getVirtualEmployeeSpend: (id: string) =>
    request<VirtualEmployeeSpend>(`/api/v1/virtual-employees/${encodeURIComponent(id)}/spend`),
  getVirtualEmployeeAudit: async (id: string) =>
    (await request<{ data: VirtualEmployeeAuditEvent[] }>(`/api/v1/virtual-employees/${encodeURIComponent(id)}/audit-events`)).data,
  listInferenceGateways: async () =>
    (await request<{ data: InferenceGateway[] }>("/api/v1/inference-gateways")).data,
  listModelProfiles: async () =>
    (await request<{ data: ModelProfile[] }>("/api/v1/model-profiles")).data,
  getModelProfile: (id: string) =>
    request<ModelProfile>(`/api/v1/model-profiles/${encodeURIComponent(id)}`),
  createModelProfile: (input: CreateModelProfileInput) =>
    request<ModelProfile>("/api/v1/model-profiles", { method: "POST", body: JSON.stringify(input) }),
  updateModelProfile: (id: string, input: UpdateModelProfileInput) =>
    request<ModelProfile>(`/api/v1/model-profiles/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(input) }),
  refreshModelProfile: (id: string) =>
    request<ModelProfile>(`/api/v1/model-profiles/${encodeURIComponent(id)}/refresh`, { method: "POST", body: "{}" }),
  deleteModelProfile: (id: string) =>
    request<{ message: string }>(`/api/v1/model-profiles/${encodeURIComponent(id)}`, { method: "DELETE" }),
  listModelProfileConsumers: async (id: string) =>
    (await request<{ data: ModelProfileConsumer[] }>(`/api/v1/model-profiles/${encodeURIComponent(id)}/consumers`)).data,
  listModelProfileAudit: async (id: string) =>
    (await request<{ data: ModelProfileAuditEvent[] }>(`/api/v1/model-profiles/${encodeURIComponent(id)}/audit`)).data,
  getExtensionCatalog: () => request<ExtensionCatalog>("/api/v1/extensions"),
  createSkill: (input: CreateSkillDefinitionInput) =>
    request<SkillDefinition>("/api/v1/extensions/skills", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateSkill: (id: string, input: UpdateSkillDefinitionInput) =>
    request<SkillDefinition>(`/api/v1/extensions/skills/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  createMcpServer: (input: CreateMcpServerDefinitionInput) =>
    request<McpServerDefinition>("/api/v1/extensions/mcp-servers", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateMcpServer: (id: string, input: UpdateMcpServerDefinitionInput) =>
    request<McpServerDefinition>(`/api/v1/extensions/mcp-servers/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  createKnowledgeSource: (input: CreateKnowledgeSourceDefinitionInput) =>
    request<KnowledgeSourceDefinition>("/api/v1/extensions/knowledge-sources", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateKnowledgeSource: (id: string, input: UpdateKnowledgeSourceDefinitionInput) =>
    request<KnowledgeSourceDefinition>(`/api/v1/extensions/knowledge-sources/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  deleteExtension: (kind: ExtensionResourceKind, id: string) =>
    request<{ message: string }>(`/api/v1/extensions/${kind}/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  listProviderAccounts: async () =>
    (await request<{ data: ProviderAccount[] }>("/api/v1/providers")).data,
  discoverProviderModels: (input: ProviderConnectionDraft) =>
    request<ProviderDiscoveryResult>("/api/v1/providers/discover", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  registerProviderAccount: (input: CreateProviderConnectionInput) =>
    request<ProviderConnectionCreationResult>("/api/v1/providers", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  revalidateProviderAccount: (id: string) =>
    request<ProviderAccount>(`/api/v1/providers/${id}/validate`, {
      method: "POST",
      body: "{}",
    }),
  deleteProviderAccount: (id: string) =>
    request<{ message: string }>(`/api/v1/providers/${id}`, {
      method: "DELETE",
    }),
  listModelDeployments: async () =>
    (await request<{ data: ModelDeployment[] }>("/api/v1/models")).data,
  registerModelDeployment: (input: CreateModelDeploymentInput) =>
    request<ModelDeployment>("/api/v1/models", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  markModelDeploymentAsDefault: (id: string) =>
    request<ModelDeployment>(`/api/v1/models/${encodeURIComponent(id)}/default`, {
      method: "POST",
      body: "{}",
    }),
  getCostSummary: (params: CostQueryParams) =>
    request<ModelCostSummaryResponse>(`/api/v1/costs/summary?${costSearch(params)}`),
  getCostActivity: (params: CostQueryParams, granularity: ModelCostGranularity = "daily") =>
    request<ModelCostActivityResponse>(`/api/v1/costs/activity?${costSearch(params, {
      group_by: params.groupBy,
      granularity,
    })}`),
  getCostInsights: (params: CostQueryParams) =>
    request<ModelCostInsightsResponse>(`/api/v1/costs/insights?${costSearch(params)}`),
  getCostRanking: (params: CostQueryParams, limit = 5) =>
    request<ModelCostRankingResponse>(`/api/v1/costs/ranking?${costSearch(params, {
      group_by: params.groupBy,
      limit: String(limit),
    })}`),
  getCostTrend: (
    params: CostQueryParams,
    granularity: ModelCostTrendGranularity = "day",
    topN = 5,
  ) =>
    request<ModelCostTrendResponse>(`/api/v1/costs/trend?${costSearch(params, {
      group_by: params.groupBy,
      granularity,
      top_n: String(topN),
    })}`),
  getCostBreakdown: (
    params: CostQueryParams,
    controls: {
      page?: number;
      pageSize?: number;
      sort?: string;
      direction?: ModelCostSortDirection;
      search?: string;
    } = {},
  ) =>
    request<ModelCostBreakdownResponse>(`/api/v1/costs/breakdown?${costSearch(params, {
      group_by: params.groupBy,
      page: String(controls.page ?? 1),
      page_size: String(controls.pageSize ?? 200),
      sort: controls.sort ?? "spend_usd",
      direction: controls.direction ?? "desc",
      search: controls.search ?? "",
    })}`),
  getCostDataQuality: (params: CostQueryParams) =>
    request<ModelCostDataQualityResponse>(`/api/v1/costs/data-quality?${costSearch(params)}`),
  listPolicies: async (): Promise<SandboxPolicyCatalog> => {
    const response = await request<{ defaultPolicyId: string; templatePolicyYaml: string; data: SandboxPolicy[] }>("/api/v1/policies");
    return {
      defaultPolicyId: response.defaultPolicyId,
      templatePolicyYaml: response.templatePolicyYaml,
      policies: response.data,
    };
  },
  createPolicy: (input: CreateSandboxPolicyInput) =>
    request<SandboxPolicy>("/api/v1/policies", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updatePolicy: (id: string, input: CreateSandboxPolicyInput) =>
    request<SandboxPolicy>(`/api/v1/policies/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  deletePolicy: (id: string) =>
    request<{ message: string }>(`/api/v1/policies/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  listAgents: async () =>
    (await request<{ data: Agent[] }>("/api/v1/instances")).data,
  getAgent: (id: string) => request<Agent>(`/api/v1/instances/${id}`),
  getAgentAudit: async (id: string) =>
    (
      await request<{ data: SandboxAuditEvent[] }>(
        `/api/v1/instances/${id}/audit`,
      )
    ).data,
  getRuntimeStatus: () => request<RuntimeStatus>("/api/v1/runtime"),
  getTerminalTargets: async (id: string) =>
    (
      await request<{ data: TerminalTarget[] }>(
        `/api/v1/instances/${id}/terminal-targets`,
      )
    ).data,
  createAgent: (input: CreateAgentInput) =>
    request<Agent>("/api/v1/instances", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  deleteAgent: (id: string) =>
    request<void>(`/api/v1/instances/${id}`, { method: "DELETE" }),
  bindAgentVirtualEmployee: (id: string, virtualEmployeeId: string) =>
    request<Agent>(`/api/v1/instances/${encodeURIComponent(id)}/virtual-employee`, {
      method: "PUT",
      body: JSON.stringify({ virtualEmployeeId }),
    }),
  unbindAgentVirtualEmployee: (id: string) =>
    request<Agent>(`/api/v1/instances/${encodeURIComponent(id)}/virtual-employee`, { method: "DELETE" }),
  createTerminalSession: (id: string, targetId: string) =>
    request<TerminalSessionResponse>(
      `/api/v1/instances/${id}/terminal-sessions`,
      { method: "POST", body: JSON.stringify({ targetId }) },
    ),
};
