import type {
  AccessPolicy,
  AccessPolicyVersion,
  Agent,
  AgentConnection,
  AgentGardenEntry,
  AgentGardenSnapshot,
  CreateKnowledgeSourceDefinitionInput,
  CreateAccessPolicyInput,
  CreateAgentConnectionInput,
  CreateAgentGardenEntryInput,
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
  ResourceCatalog,
  ResourceKind,
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
  PlatformAuditLogListResponse,
  PlatformAuditLogQuery,
  RuntimeStatus,
  SandboxPolicy,
  SandboxPolicyCatalog,
  SandboxAuditEvent,
  TerminalSessionResponse,
  TerminalTarget,
  TraceDetail,
  TraceListResponse,
  SkillDefinition,
  UpdateKnowledgeSourceDefinitionInput,
  UpdateAccessPolicyInput,
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

async function requestBinary(
  path: string,
  fallbackFileName: string,
): Promise<{ blob: Blob; fileName: string }> {
  const token = getAuthToken();
  const projectId =
    typeof window === "undefined"
      ? null
      : projectIdFromPathname(window.location.pathname);
  const response = await fetch(projectScopedPath(path, projectId), {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (response.status === 401 && typeof window !== "undefined") {
    clearAuthToken();
    window.location.assign("/login");
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: unknown } | null;
    throw new ApiError(
      typeof payload?.error === "string"
        ? payload.error
        : `Download failed (${response.status})`,
      response.status,
    );
  }
  const disposition = response.headers.get("content-disposition") ?? "";
  const fileName =
    disposition.match(/filename="([^"]+)"/i)?.[1]
    ?? fallbackFileName;
  return { blob: await response.blob(), fileName };
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

function auditLogSearch(params: PlatformAuditLogQuery): string {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(name, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export const api = {
  listTraces: () => request<TraceListResponse>("/api/v1/traces"),
  getTrace: (traceId: string) =>
    request<TraceDetail>(`/api/v1/traces/${encodeURIComponent(traceId)}`),
  listAuditLogs: (params: PlatformAuditLogQuery = {}) =>
    request<PlatformAuditLogListResponse>(
      `/api/v1/audit-logs${auditLogSearch(params)}`,
    ),
  exportAuditLogs: (
    params: Omit<PlatformAuditLogQuery, "cursor" | "limit"> = {},
  ) =>
    requestBinary(
      `/api/v1/audit-logs/export${auditLogSearch(params)}`,
      "audit-logs.csv",
    ),
  listAccessPolicies: async () =>
    (await request<{ data: AccessPolicy[] }>("/api/v1/access-policies")).data,
  getAccessPolicy: (id: string) =>
    request<AccessPolicy>(`/api/v1/access-policies/${encodeURIComponent(id)}`),
  createAccessPolicy: (input: CreateAccessPolicyInput) =>
    request<AccessPolicy>("/api/v1/access-policies", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateAccessPolicy: (id: string, input: UpdateAccessPolicyInput) =>
    request<AccessPolicy>(`/api/v1/access-policies/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  deleteAccessPolicy: (id: string) =>
    request<void>(`/api/v1/access-policies/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  listAccessPolicyVersions: async (id: string) =>
    (await request<{ data: AccessPolicyVersion[] }>(
      `/api/v1/access-policies/${encodeURIComponent(id)}/versions`,
    )).data,
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
  getResourceCatalog: () => request<ResourceCatalog>("/api/v1/catalog"),
  getAgentGarden: () =>
    request<AgentGardenSnapshot>("/api/v1/agent-garden"),
  registerGardenAgent: (input: CreateAgentGardenEntryInput) =>
    request<AgentGardenEntry>("/api/v1/agent-garden/agents", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  discoverGardenAgent: (id: string) =>
    request<AgentGardenEntry>(
      `/api/v1/agent-garden/agents/${encodeURIComponent(id)}/discover`,
      {
        method: "POST",
        body: "{}",
      },
    ),
  removeGardenAgent: (id: string) =>
    request<{ message: string }>(
      `/api/v1/agent-garden/agents/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    ),
  connectGardenAgent: (input: CreateAgentConnectionInput) =>
    request<AgentConnection>("/api/v1/agent-garden/connections", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  disconnectGardenAgent: (id: string) =>
    request<{ message: string }>(
      `/api/v1/agent-garden/connections/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    ),
  createSkill: (input: CreateSkillDefinitionInput) =>
    request<SkillDefinition>("/api/v1/catalog/skills", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateSkill: (id: string, input: UpdateSkillDefinitionInput) =>
    request<SkillDefinition>(`/api/v1/catalog/skills/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  verifySkillArtifact: (id: string) =>
    request<SkillDefinition>(
      `/api/v1/catalog/skills/${encodeURIComponent(id)}/verify`,
      {
        method: "POST",
        body: "{}",
      },
    ),
  downloadSkillArtifact: (id: string) =>
    requestBinary(
      `/api/v1/catalog/skills/${encodeURIComponent(id)}/archive`,
      `${id}.tar.gz`,
    ),
  createMcpServer: (input: CreateMcpServerDefinitionInput) =>
    request<McpServerDefinition>("/api/v1/catalog/mcp-servers", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateMcpServer: (id: string, input: UpdateMcpServerDefinitionInput) =>
    request<McpServerDefinition>(`/api/v1/catalog/mcp-servers/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  discoverMcpServer: (id: string) =>
    request<McpServerDefinition>(`/api/v1/catalog/mcp-servers/${encodeURIComponent(id)}/discover`, {
      method: "POST",
      body: "{}",
    }),
  createKnowledgeSource: (input: CreateKnowledgeSourceDefinitionInput) =>
    request<KnowledgeSourceDefinition>("/api/v1/catalog/knowledge-sources", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateKnowledgeSource: (id: string, input: UpdateKnowledgeSourceDefinitionInput) =>
    request<KnowledgeSourceDefinition>(`/api/v1/catalog/knowledge-sources/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  deleteResource: (kind: ResourceKind, id: string) =>
    request<{ message: string }>(`/api/v1/catalog/${kind}/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  listProviderAccounts: async () =>
    (await request<{ data: ProviderAccount[] }>("/api/v1/providers")).data,
  discoverProviderModels: (input: ProviderConnectionDraft) =>
    request<ProviderDiscoveryResult>("/api/v1/providers/discover", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  discoverProviderAccountModels: (id: string) =>
    request<ProviderDiscoveryResult>(
      `/api/v1/providers/${encodeURIComponent(id)}/discover`,
      {
        method: "POST",
        body: "{}",
      },
    ),
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
  deleteModelDeployment: (id: string) =>
    request<{ message: string }>(`/api/v1/models/${encodeURIComponent(id)}`, {
      method: "DELETE",
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
