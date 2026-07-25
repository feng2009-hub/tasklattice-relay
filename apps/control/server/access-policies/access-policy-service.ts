import { randomUUID } from "node:crypto";
import type {
  AccessPolicy,
  AccessPolicyDecision,
  AccessPolicyServerRule,
  AccessPolicyVersion,
  Agent,
  CreateAccessPolicyInput,
  KnowledgeSourceDefinition,
  McpServerDefinition,
  UpdateAccessPolicyInput,
} from "@tasklattice/contracts";
import type {
  LiteLLMAdminClient,
  LiteLLMObjectPermissions,
} from "../providers/litellm-client";
import { ProjectStore } from "../projects/project-store";
import { AccessPolicyStore } from "./access-policy-store";

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function resolvedDecision(
  rule: AccessPolicyServerRule,
  toolName: string,
): Exclude<AccessPolicyDecision, "INHERIT"> {
  const decision = rule.tools.find((tool) => tool.toolName === toolName)?.decision;
  return !decision || decision === "INHERIT" ? rule.defaultDecision : decision;
}

export function effectiveInstanceObjectPermissions(
  virtualEmployeeId: string,
  selectedServers: McpServerDefinition[],
  knowledgeSources: KnowledgeSourceDefinition[],
  policies: AccessPolicy[],
): LiteLLMObjectPermissions {
  const active = policies.filter(
    (policy) =>
      policy.status === "ACTIVE" &&
      policy.virtualEmployeeIds.includes(virtualEmployeeId),
  );
  const allowedServers: McpServerDefinition[] = [];
  const toolPermissions: Record<string, string[]> = {};

  for (const server of selectedServers) {
    const rules = active.flatMap((policy) =>
      policy.serverRules.filter((rule) => rule.mcpServerId === server.id),
    );
    if (!rules.length) continue;
    const serverCeiling = server.allowedTools.length
      ? new Set(server.allowedTools)
      : undefined;
    const allowedTools = server.tools
      .map((tool) => tool.name)
      .filter((toolName) => !serverCeiling || serverCeiling.has(toolName))
      .filter((toolName) => {
        const decisions = rules.map((rule) => resolvedDecision(rule, toolName));
        return !decisions.includes("DENY") && decisions.includes("ALLOW");
      });
    if (!allowedTools.length) continue;
    allowedServers.push(server);
    toolPermissions[server.litellmServerId] = unique(allowedTools);
  }

  return {
    mcpServers: allowedServers.map((server) => server.litellmServerId),
    mcpAccessGroups: unique(allowedServers.flatMap((server) => server.accessGroups)),
    mcpToolPermissions: toolPermissions,
    vectorStores: knowledgeSources.map((source) => source.vectorStoreId),
  };
}

export class AccessPolicyService {
  constructor(
    private readonly store: AccessPolicyStore,
    private readonly projects: ProjectStore,
    private readonly litellm: LiteLLMAdminClient,
  ) {}

  list(): Promise<AccessPolicy[]> {
    return this.store.list();
  }

  async get(id: string): Promise<AccessPolicy> {
    const policy = await this.store.get(id);
    if (!policy) throw new Error("Access Policy not found.");
    return policy;
  }

  async create(
    input: CreateAccessPolicyInput,
    actor: string,
  ): Promise<AccessPolicy> {
    await this.validate(input);
    const policies = await this.store.list();
    if (policies.some((policy) => policy.name.toLowerCase() === input.name.toLowerCase()))
      throw new Error("An Access Policy with this name already exists.");
    const now = new Date().toISOString();
    const policy: AccessPolicy = {
      ...input,
      id: randomUUID(),
      revision: 1,
      createdBy: actor,
      createdAt: now,
      updatedAt: now,
    };
    await this.store.save(policy, this.version(policy, actor, "Policy created."));
    return input.status === "ACTIVE"
      ? this.reconcile(policy, input.virtualEmployeeIds)
      : policy;
  }

  async update(
    id: string,
    input: UpdateAccessPolicyInput,
    actor: string,
  ): Promise<AccessPolicy> {
    const current = await this.get(id);
    const nextInput: CreateAccessPolicyInput = {
      name: input.name ?? current.name,
      status: input.status ?? current.status,
      virtualEmployeeIds: input.virtualEmployeeIds ?? current.virtualEmployeeIds,
      serverRules: input.serverRules ?? current.serverRules,
    };
    await this.validate(nextInput);
    const policies = await this.store.list();
    if (policies.some((policy) => policy.id !== id && policy.name.toLowerCase() === nextInput.name.toLowerCase()))
      throw new Error("An Access Policy with this name already exists.");
    const {
      lastReconciliationError: _lastReconciliationError,
      ...currentWithoutError
    } = current;
    const policy: AccessPolicy = {
      ...currentWithoutError,
      ...nextInput,
      revision: current.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    await this.store.save(
      policy,
      this.version(policy, actor, this.changeSummary(current, policy)),
    );
    const affectedEmployees = unique([
      ...(current.status === "ACTIVE" ? current.virtualEmployeeIds : []),
      ...(policy.status === "ACTIVE" ? policy.virtualEmployeeIds : []),
    ]);
    return affectedEmployees.length
      ? this.reconcile(policy, affectedEmployees)
      : policy;
  }

  versions(id: string): Promise<AccessPolicyVersion[]> {
    return this.store.versions(id);
  }

  async delete(id: string): Promise<boolean> {
    const current = await this.get(id);
    if (current.status === "ACTIVE")
      throw new Error("Deactivate the Access Policy before deleting it.");
    return this.store.delete(id);
  }

  async permissionsForAgent(
    agent: Pick<Agent, "virtualEmployeeId" | "mcpServerIds" | "knowledgeSourceIds">,
  ): Promise<LiteLLMObjectPermissions> {
    const [servers, sources, policies] = await Promise.all([
      this.projects.listMcpServerDefinitions(),
      this.projects.listKnowledgeSourceDefinitions(),
      this.store.list(),
    ]);
    return effectiveInstanceObjectPermissions(
      agent.virtualEmployeeId,
      servers.filter((server) => (agent.mcpServerIds ?? []).includes(server.id)),
      sources.filter((source) => (agent.knowledgeSourceIds ?? []).includes(source.id)),
      policies,
    );
  }

  private async validate(input: CreateAccessPolicyInput): Promise<void> {
    const [servers, employees] = await Promise.all([
      this.projects.listMcpServerDefinitions(),
      this.projects.database().virtualEmployeeRecord.findMany({
        where: { projectId: this.projects.projectId },
        select: { id: true },
      }),
    ]);
    const knownServers = new Map(servers.map((server) => [server.id, server]));
    const knownEmployees = new Set(employees.map((employee) => employee.id));
    if (new Set(input.virtualEmployeeIds).size !== input.virtualEmployeeIds.length)
      throw new Error("Virtual Employee bindings must be unique.");
    const missingEmployees = input.virtualEmployeeIds.filter((id) => !knownEmployees.has(id));
    if (missingEmployees.length)
      throw new Error(`Virtual Employee not found: ${missingEmployees.join(", ")}.`);
    if (new Set(input.serverRules.map((rule) => rule.mcpServerId)).size !== input.serverRules.length)
      throw new Error("Each MCP server may appear only once in an Access Policy.");
    for (const rule of input.serverRules) {
      const server = knownServers.get(rule.mcpServerId);
      if (!server) throw new Error(`MCP server not found: ${rule.mcpServerId}.`);
      if (new Set(rule.tools.map((tool) => tool.toolName)).size !== rule.tools.length)
        throw new Error(`Tool rules for ${server.name} must be unique.`);
      const discovered = new Set(server.tools.map((tool) => tool.name));
      const missingTools = rule.tools
        .map((tool) => tool.toolName)
        .filter((name) => !discovered.has(name));
      if (missingTools.length)
        throw new Error(`Discovered MCP tools not found on ${server.name}: ${missingTools.join(", ")}.`);
    }
  }

  private async reconcile(
    policy: AccessPolicy,
    virtualEmployeeIds: string[],
  ): Promise<AccessPolicy> {
    try {
      if (!this.litellm.updateInstanceObjectPermissions)
        throw new Error("LiteLLM key permission updates are unavailable.");
      const agents = (await this.projects.list()).filter(
        (agent) =>
          virtualEmployeeIds.includes(agent.virtualEmployeeId) &&
          agent.liteLLMTokenId,
      );
      for (const agent of agents) {
        await this.litellm.updateInstanceObjectPermissions(
          agent.liteLLMTokenId!,
          await this.permissionsForAgent(agent),
        );
      }
      const {
        lastReconciliationError: _lastReconciliationError,
        ...policyWithoutError
      } = policy;
      return this.store.updateReconciliation({
        ...policyWithoutError,
        lastReconciledAt: new Date().toISOString(),
      });
    } catch (error) {
      return this.store.updateReconciliation({
        ...policy,
        lastReconciliationError:
          error instanceof Error ? error.message : "LiteLLM reconciliation failed.",
      });
    }
  }

  private version(
    policy: AccessPolicy,
    actor: string,
    summary: string,
  ): AccessPolicyVersion {
    return {
      policyId: policy.id,
      revision: policy.revision,
      actor,
      summary,
      snapshot: policy,
      createdAt: policy.updatedAt,
    };
  }

  private changeSummary(current: AccessPolicy, next: AccessPolicy): string {
    const changes = [
      current.status !== next.status ? `Status changed to ${next.status}.` : "",
      JSON.stringify(current.serverRules) !== JSON.stringify(next.serverRules)
        ? "MCP tool rules updated."
        : "",
      JSON.stringify(current.virtualEmployeeIds) !== JSON.stringify(next.virtualEmployeeIds)
        ? "Virtual Employee bindings updated."
        : "",
      current.name !== next.name
        ? "Policy name updated."
        : "",
    ].filter(Boolean);
    return changes.join(" ") || "Policy saved.";
  }
}
