import type {
  Agent,
  CreateAgentInput,
  CostReport,
  CreateModelDeploymentInput,
  CreateProviderAccountInput,
  ModelDeployment,
  ProviderAccount,
  RuntimeStatus,
  SandboxAuditEvent,
  TerminalSessionResponse,
} from "@tasklattice/contracts";
import { clearAuthToken, getAuthToken } from "./auth-token";

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
    throw new Error(
      "error" in (payload as object)
        ? (payload as { error: string }).error
        : `Request failed (${response.status})`,
    );
  return payload as T;
}

export const api = {
  listProviderAccounts: async () =>
    (await request<{ data: ProviderAccount[] }>("/api/v1/providers")).data,
  registerProviderAccount: (input: CreateProviderAccountInput) =>
    request<ProviderAccount>("/api/v1/providers", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  revalidateProviderAccount: (id: string) =>
    request<ProviderAccount>(`/api/v1/providers/${id}/validate`, {
      method: "POST",
      body: "{}",
    }),
  listModelDeployments: async () =>
    (await request<{ data: ModelDeployment[] }>("/api/v1/providers/models")).data,
  registerModelDeployment: (input: CreateModelDeploymentInput) =>
    request<ModelDeployment>("/api/v1/providers/models", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  getCostReport: (from: string, to: string) =>
    request<CostReport>(`/api/v1/costs?${new URLSearchParams({ from, to })}`),
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
  createAgent: (input: CreateAgentInput) =>
    request<Agent>("/api/v1/agents", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  deleteAgent: (id: string) =>
    request<void>(`/api/v1/agents/${id}`, { method: "DELETE" }),
  createTerminalSession: (id: string) =>
    request<TerminalSessionResponse>(
      `/api/v1/agents/${id}/terminal-sessions`,
      { method: "POST", body: "{}" },
    ),
};
