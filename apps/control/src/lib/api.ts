import type {
  Agent,
  CreateKnowledgeSourceDefinitionInput,
  CreateAgentInput,
  CostReport,
  CreateMcpServerDefinitionInput,
  CreateModelDeploymentInput,
  CreateProviderConnectionInput,
  CreateSandboxPolicyInput,
  CreateSkillDefinitionInput,
  ExtensionCatalog,
  ExtensionResourceKind,
  KnowledgeSourceDefinition,
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
} from "@tasklattice/contracts";
import { clearAuthToken, getAuthToken } from "./auth-token";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const response = await fetch(path, {
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
      "error" in (payload as object)
        ? (payload as { error: string }).error
        : `Request failed (${response.status})`,
      response.status,
    );
  return payload as T;
}

export const api = {
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
    (await request<{ data: ModelDeployment[] }>("/api/v1/providers/models")).data,
  registerModelDeployment: (input: CreateModelDeploymentInput) =>
    request<ModelDeployment>("/api/v1/providers/models", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  markModelDeploymentAsDefault: (id: string) =>
    request<ModelDeployment>(`/api/v1/providers/models/${encodeURIComponent(id)}/default`, {
      method: "POST",
      body: "{}",
    }),
  getCostReport: (from: string, to: string) =>
    request<CostReport>(`/api/v1/costs?${new URLSearchParams({ from, to })}`),
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
    (await request<{ data: Agent[] }>("/api/v1/agents")).data,
  getAgent: (id: string) => request<Agent>(`/api/v1/agents/${id}`),
  getAgentAudit: async (id: string) =>
    (
      await request<{ data: SandboxAuditEvent[] }>(
        `/api/v1/agents/${id}/audit`,
      )
    ).data,
  getRuntimeStatus: () => request<RuntimeStatus>("/api/v1/runtime"),
  getTerminalTargets: async (id: string) =>
    (
      await request<{ data: TerminalTarget[] }>(
        `/api/v1/agents/${id}/terminal-targets`,
      )
    ).data,
  createAgent: (input: CreateAgentInput) =>
    request<Agent>("/api/v1/agents", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  deleteAgent: (id: string) =>
    request<void>(`/api/v1/agents/${id}`, { method: "DELETE" }),
  createTerminalSession: (id: string, targetId: string) =>
    request<TerminalSessionResponse>(
      `/api/v1/agents/${id}/terminal-sessions`,
      { method: "POST", body: JSON.stringify({ targetId }) },
    ),
};
