import { randomUUID } from "node:crypto";
import type {
  Agent,
  CreateAgentInput,
  RunnerSandbox,
  SandboxAuditEvent,
} from "@tasklattice/contracts";
import { sandboxPolicies } from "@tasklattice/contracts";
import { AgentStore } from "../data/agent-store";
import { NemoClawRunnerClient } from "../runtime/nemoclaw-runner-client";
import { localDeepSeekConnectionId } from "../providers/provider-connection-service";

const demoAgentId = "00000000-0000-4000-8000-000000000001";

export function agentSandboxName(name: string, id: string): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 14)
      .replace(/-$/, "") || "agent";
  return `tali-${slug}-${id.slice(0, 8)}`;
}

function applyObservedState(agent: Agent, observed: RunnerSandbox): Agent {
  const status: Agent["status"] =
    observed.phase === "READY"
      ? "READY"
      : observed.phase === "FAILED" || observed.phase === "NOT_FOUND"
        ? "FAILED"
        : observed.phase === "DESTROYING"
          ? "DESTROYING"
          : "PROVISIONING";
  const { httpEndpoint: _previousHttpEndpoint, ...current } = agent;
  return {
    ...current,
    status,
    runtimePhase: observed.phase,
    ...(observed.provisioningStage
      ? { provisioningStage: observed.provisioningStage }
      : {}),
    logs: observed.logs,
    ...(observed.httpEndpoint
      ? { httpEndpoint: observed.httpEndpoint }
      : {}),
    updatedAt: new Date().toISOString(),
    ...(observed.operationId ? { operationId: observed.operationId } : {}),
    ...(observed.error ? { error: observed.error } : {}),
  };
}

export class AgentService {
  constructor(
    readonly store = new AgentStore(),
    readonly runner = new NemoClawRunnerClient(),
  ) {}

  async list(): Promise<Agent[]> {
    return Promise.all(this.store.list().map((agent) => this.refresh(agent)));
  }

  async get(id: string): Promise<Agent | undefined> {
    const agent = this.store.get(id);
    return agent ? this.refresh(agent) : undefined;
  }

  async getAudit(id: string): Promise<SandboxAuditEvent[] | undefined> {
    const agent = this.store.get(id);
    return agent
      ? this.runner.getSandboxAudit(agent.sandboxName)
      : undefined;
  }

  async create(input: CreateAgentInput): Promise<Agent> {
    const connection = this.store.getProviderConnection(
      input.providerConnectionId,
    );
    if (!connection || connection.status !== "VALIDATED")
      throw new Error(
        "Select a validated provider connection before creating an Instance.",
      );
    const apiKey = this.store.getProviderConnectionCredential(connection.id);
    if (!apiKey)
      throw new Error(
        "The selected provider connection no longer has a backend credential.",
      );
    const policy = sandboxPolicies.find((item) => item.id === input.policyId);
    if (!policy) throw new Error("Select a supported OpenShell policy.");
    const id = randomUUID();
    const now = new Date().toISOString();
    let agent: Agent = {
      id,
      ...input,
      provider: connection.provider,
      model: connection.model,
      sandboxName: agentSandboxName(input.name, id),
      status: "PROVISIONING",
      provisioningStage: "QUEUED",
      createdAt: now,
      updatedAt: now,
      logs: ["Agent request accepted. Waiting for the NemoClaw Runtime Host."],
    };
    this.store.save(agent);
    try {
      agent = this.store.save(
        applyObservedState(
          agent,
          await this.runner.createSandbox({
            name: agent.sandboxName,
            provider: connection.provider,
            model: connection.model,
            policyYaml: policy.policyYaml,
            systemPrompt: input.systemPrompt,
            apiKey,
          }),
        ),
      );
    } catch (error) {
      agent = this.store.save({
        ...agent,
        status: "FAILED",
        updatedAt: new Date().toISOString(),
        error:
          error instanceof Error
            ? error.message
            : "Runtime runner rejected the request.",
      });
    }
    return agent;
  }

  async destroy(id: string): Promise<boolean> {
    const agent = this.store.get(id);
    if (!agent) return false;
    this.store.save({
      ...agent,
      status: "DESTROYING",
      updatedAt: new Date().toISOString(),
    });
    await this.runner.destroySandbox(agent.sandboxName);
    this.store.delete(id);
    return true;
  }

  async seedLocalDemo(): Promise<void> {
    if (process.env.TALI_ENABLE_TEST_SEED !== "1") return;
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey)
      throw new Error(
        "DEEPSEEK_API_KEY is required when TALI_ENABLE_TEST_SEED=1.",
      );
    this.store.saveProviderCredential("deepseek", apiKey);
    const existing = this.store.get(demoAgentId);
    const now = new Date().toISOString();
    let agent: Agent = {
      id: demoAgentId,
      name: "DeepSeek NemoClaw Demo",
      description: "Seeded local Agent for the NemoClaw core-flow test.",
      runtime: "nemoclaw",
      providerConnectionId: localDeepSeekConnectionId,
      sandboxName: agentSandboxName("DeepSeek NemoClaw Demo", demoAgentId),
      status: "PROVISIONING",
      provisioningStage: "QUEUED",
      provider: "deepseek",
      model: "deepseek-chat",
      policyId: "restricted",
      systemPrompt:
        "You are the seeded TaskLattice test Agent. Complete requests inside the NemoClaw sandbox and report concise execution evidence.",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      logs: [
        "Local test seed loaded from SQLite.",
        "DeepSeek credential resolved from the test credential record.",
      ],
    };
    this.store.save(agent);
    try {
      const request = {
        name: agent.sandboxName,
        provider: agent.provider,
        model: agent.model,
        policyYaml: sandboxPolicies[0].policyYaml,
        systemPrompt: agent.systemPrompt,
        apiKey,
      } as const;
      let observed: RunnerSandbox;
      try {
        observed = await this.runner.createSandbox(request);
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !error.message.includes("already exists")
        )
          throw error;
        observed = await this.runner.getSandbox(agent.sandboxName);
      }
      agent = this.store.save(applyObservedState(agent, observed));
    } catch (error) {
      this.store.save({
        ...agent,
        status: "FAILED",
        updatedAt: new Date().toISOString(),
        error:
          error instanceof Error
            ? error.message
            : "Unable to provision the seeded test Agent.",
      });
    }
  }

  private async refresh(agent: Agent): Promise<Agent> {
    if (agent.status === "FAILED") return agent;
    try {
      return this.store.save(
        applyObservedState(
          agent,
          await this.runner.getSandbox(agent.sandboxName),
        ),
      );
    } catch (error) {
      return {
        ...agent,
        logs: [
          ...agent.logs,
          `Runtime observation unavailable: ${error instanceof Error ? error.message : "unknown error"}`,
        ],
      };
    }
  }
}
