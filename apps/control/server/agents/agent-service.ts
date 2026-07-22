import { randomUUID } from "node:crypto";
import type {
  Agent,
  CreateAgentInput,
  RunnerSandbox,
  SandboxAuditEvent,
} from "@tasklattice/contracts";
import { AgentStore } from "../data/agent-store";
import { ExtensionCatalogService } from "../extensions/extension-catalog-service";
import { NemoClawRunnerClient, type RunnerClient } from "../runtime/nemoclaw-runner-client";
import { LiteLLMClient, type LiteLLMAdminClient } from "../providers/litellm-client";
import { PolicyService } from "../policies/policy-service";
import { InferenceGroupService } from "../inference-groups/inference-group-service";

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
    readonly extensions = new ExtensionCatalogService(store),
    readonly inferenceGroups = new InferenceGroupService(store, litellm),
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
    const catalog = this.extensions.catalog();
    if (input.specializationId && !catalog.specializations.some((item) => item.id === input.specializationId))
      throw new Error("Select an available Agent Role before creating an Instance.");
    const references: Array<[string, readonly string[] | undefined, Set<string>]> = [
      ["Skill", input.skillIds, new Set(catalog.skills.map((item) => item.id))],
      ["MCP server", input.mcpServerIds, new Set(catalog.mcpServers.map((item) => item.id))],
      ["Knowledge source", input.knowledgeSourceIds, new Set(catalog.knowledgeSources.map((item) => item.id))],
    ];
    for (const [label, ids, available] of references) {
      const missing = (ids ?? []).filter((id) => !available.has(id));
      if (missing.length) throw new Error(`${label} configuration is unavailable: ${missing.join(", ")}.`);
    }
    const policy = this.policies.resolve(input.policyId);
    const id = randomUUID();
    const now = new Date().toISOString();
    const sandboxName = agentSandboxName(input.name, id);
    const managed = await this.inferenceGroups.bindAgent(id, input.inferenceGroupId);
    const costKeyAlias = `tasklattice/${managed.group.id.slice(0, 8)}/${id.slice(0, 8)}`;
    const costKey = { secret: managed.secret, tokenId: managed.binding.liteLLMTokenId };
    let agent: Agent = {
      schemaVersion: 1,
      id,
      ...input,
      policyId: policy.id,
      modelDeploymentId: `inference-group:${managed.group.id}`,
      providerAccountId: managed.gateway.id,
      providerName: "LiteLLM managed",
      model: managed.group.publicModelAlias,
      modelType: "llm",
      inferenceMode: "PLATFORM_MANAGED",
      inferenceGroupId: managed.group.id,
      inferenceBindingId: managed.binding.id,
      inferenceStatus: managed.group.status,
      inferenceComplianceDomain: managed.group.complianceDomain,
      inferenceCapabilities: managed.group.capabilities,
      inferenceKeyFingerprint: managed.binding.keyFingerprint,
      ...(managed.group.lastSynchronizedAt ? { inferenceLastSynchronizedAt: managed.group.lastSynchronizedAt } : {}),
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
            providerName: "LiteLLM",
            model: managed.group.publicModelAlias,
            inferenceEndpoint: `${managed.gateway.baseUrl}/v1`,
            policyYaml: policy.policyYaml,
            systemPrompt: input.systemPrompt,
            apiKey: costKey.secret,
          }),
        ),
      );
    } catch (error) {
      await this.inferenceGroups.unbindAgent(id).catch(() => undefined);
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
    await this.inferenceGroups.unbindAgent(id);
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
