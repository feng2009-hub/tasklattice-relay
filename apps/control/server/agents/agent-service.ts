import { randomUUID } from "node:crypto";
import type {
  Agent,
  CreateAgentInput,
  RunnerSandbox,
  SandboxAuditEvent,
} from "@tasklattice/contracts";
import { AgentStore } from "../data/agent-store";
import { NemoClawRunnerClient, type RunnerClient } from "../runtime/nemoclaw-runner-client";
import { LiteLLMClient, type LiteLLMAdminClient } from "../providers/litellm-client";
import { PolicyService } from "../policies/policy-service";

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

export function applyObservedState(agent: Agent, observed: RunnerSandbox): Agent {
  const status: Agent["status"] =
    observed.phase === "READY"
      ? "READY"
      : observed.phase === "FAILED" || observed.phase === "NOT_FOUND"
        ? "FAILED"
        : observed.phase === "DESTROYING"
          ? "DESTROYING"
          : "PROVISIONING";
  const {
    error: _previousError,
    httpEndpoint: _previousHttpEndpoint,
    ...current
  } = agent;
  return {
    ...current,
    status,
    runtimePhase: observed.phase,
    ...(observed.provisioningStage
      ? { provisioningStage: observed.provisioningStage }
      : {}),
    logs: observed.logs.length > 0 ? observed.logs : agent.logs,
    ...(observed.httpEndpoint
      ? { httpEndpoint: observed.httpEndpoint }
      : {}),
    updatedAt: new Date().toISOString(),
    ...(observed.operationId ? { operationId: observed.operationId } : {}),
    ...(observed.error
      ? { error: observed.error }
      : observed.phase === "NOT_FOUND"
        ? {
            error:
              "The OpenShell Sandbox was not found while reconciling the Instance lifecycle.",
          }
        : {}),
  };
}

export class AgentService {
  constructor(
    readonly store = new AgentStore(),
    readonly runner: RunnerClient = new NemoClawRunnerClient(),
    readonly litellm: LiteLLMAdminClient = new LiteLLMClient(),
    readonly policies = new PolicyService(store),
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
    const deployment = this.store.getModelDeployment(input.modelDeploymentId);
    if (!deployment || deployment.status !== "VALIDATED" || deployment.modelType !== "llm")
      throw new Error(
        "Select a validated LLM deployment before creating an Instance.",
      );
    const account = this.store.getProviderAccount(deployment.providerAccountId);
    if (!account || account.status !== "VALIDATED")
      throw new Error("The model's Provider Account is no longer validated.");
    const policy = this.policies.resolve(input.policyId);
    const id = randomUUID();
    const now = new Date().toISOString();
    const sandboxName = agentSandboxName(input.name, id);
    const costKeyAlias = `${sandboxName}:${deployment.modelId}`;
    const costKey = await this.litellm.createInstanceKey({
      agentId: id,
      alias: costKeyAlias,
      modelName: deployment.litellmModelName,
    });
    this.store.saveAgentCostKey(id, costKey.tokenId);
    let agent: Agent = {
      id,
      ...input,
      policyId: policy.id,
      providerAccountId: account.id,
      providerName: deployment.providerName,
      model: deployment.modelId,
      modelType: "llm",
      costKeyAlias,
      sandboxName,
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
            agentPlatform: agent.agentPlatform,
            providerName: deployment.providerName,
            model: deployment.litellmModelName,
            inferenceEndpoint: `${this.litellm.baseUrl}/v1`,
            policyYaml: policy.policyYaml,
            systemPrompt: input.systemPrompt,
            apiKey: costKey.secret,
          }),
        ),
      );
    } catch (error) {
      await this.litellm.revokeKey(costKey.tokenId).catch(() => undefined);
      this.store.deleteAgentCostKey(id);
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
    await this.runner.destroySandbox(agent.sandboxName, agent.agentPlatform);
    const tokenId = this.store.getAgentCostKey(id);
    if (tokenId) await this.litellm.revokeKey(tokenId);
    this.store.deleteAgentCostKey(id);
    this.store.delete(id);
    return true;
  }

  private async refresh(agent: Agent): Promise<Agent> {
    if (agent.status === "FAILED") return agent;
    try {
      return this.store.save(
        applyObservedState(
          agent,
          await this.runner.getSandbox(agent.sandboxName, agent.agentPlatform),
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
