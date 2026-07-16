import type {
  AgentPlatformId,
  RunnerHealth,
  RunnerSandbox,
  SandboxAuditEvent,
} from "@tasklattice/contracts";

export interface CreateSandboxInput {
  name: string;
  agentPlatform: AgentPlatformId;
  providerName: string;
  model: string;
  inferenceEndpoint: string;
  policyYaml: string;
  systemPrompt: string;
  apiKey?: string;
}

export interface RunnerClient {
  createSandbox(input: CreateSandboxInput): Promise<RunnerSandbox>;
  getSandbox(name: string, agentPlatform: AgentPlatformId): Promise<RunnerSandbox>;
  getSandboxAudit(name: string): Promise<SandboxAuditEvent[]>;
  destroySandbox(name: string, agentPlatform: AgentPlatformId): Promise<RunnerSandbox>;
  getHealth(): Promise<RunnerHealth>;
  terminalWebSocketUrl(name: string, agentPlatform: AgentPlatformId): string;
  authorizationHeaders(): Record<string, string>;
}

export class NemoClawRunnerClient implements RunnerClient {
  readonly baseUrl: string;

  constructor(
    baseUrl = process.env.NEMOCLAW_RUNNER_URL ?? "http://127.0.0.1:9090",
    private readonly token = process.env.NEMOCLAW_RUNNER_TOKEN ??
      "local-dev-token",
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.token}`,
        "content-type": "application/json",
        ...init?.headers,
      },
      signal: AbortSignal.timeout(15_000),
    });
    const payload = (await response.json()) as T | { error: string };
    if (!response.ok) {
      throw new Error(
        "error" in (payload as object)
          ? (payload as { error: string }).error
          : `Runner returned ${response.status}`,
      );
    }
    return payload as T;
  }

  createSandbox(input: CreateSandboxInput): Promise<RunnerSandbox> {
    return this.request<RunnerSandbox>("/v1/sandboxes", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  getSandbox(
    name: string,
    agentPlatform: AgentPlatformId,
  ): Promise<RunnerSandbox> {
    return this.request<RunnerSandbox>(
      `/v1/sandboxes/${encodeURIComponent(name)}?agentPlatform=${agentPlatform}`,
    );
  }

  async getSandboxAudit(name: string): Promise<SandboxAuditEvent[]> {
    return (
      await this.request<{ data: SandboxAuditEvent[] }>(
        `/v1/sandboxes/${encodeURIComponent(name)}/audit`,
      )
    ).data;
  }

  destroySandbox(
    name: string,
    agentPlatform: AgentPlatformId,
  ): Promise<RunnerSandbox> {
    return this.request<RunnerSandbox>(
      `/v1/sandboxes/${encodeURIComponent(name)}?agentPlatform=${agentPlatform}`,
      { method: "DELETE" },
    );
  }

  getHealth(): Promise<RunnerHealth> {
    return this.request<RunnerHealth>("/health");
  }

  terminalWebSocketUrl(
    name: string,
    agentPlatform: AgentPlatformId,
  ): string {
    const url = new URL(this.baseUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = `/v1/sandboxes/${encodeURIComponent(name)}/terminal`;
    url.searchParams.set("agentPlatform", agentPlatform);
    return url.toString();
  }

  authorizationHeaders(): Record<string, string> {
    return { authorization: `Bearer ${this.token}` };
  }
}
