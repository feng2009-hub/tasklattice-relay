import { randomUUID } from "node:crypto";
import type {
  Agent,
  CreateAgentInput,
  RunnerSandbox,
  SandboxAuditEvent,
} from "@tasklattice/contracts";
import { ProjectStore } from "../projects/project-store";
import { ExtensionCatalogService } from "../extensions/extension-catalog-service";
import { NemoClawRunnerClient, type RunnerClient } from "../runtime/nemoclaw-runner-client";
import { LiteLLMClient, type LiteLLMAdminClient } from "../providers/litellm-client";
import { PolicyService } from "../policies/policy-service";
import { ModelProfileService } from "../model-profiles/model-profile-service";
import { VirtualEmployeeService } from "../virtual-employees/virtual-employee-service";
import { VirtualEmployeeStore } from "../virtual-employees/virtual-employee-store";
import { ProjectQuotaService } from "../quotas/project-quota-service";

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
    readonly store = new ProjectStore(),
    readonly runner: RunnerClient = new NemoClawRunnerClient(),
    readonly litellm: LiteLLMAdminClient = new LiteLLMClient(),
    readonly policies = new PolicyService(store),
    readonly extensions = new ExtensionCatalogService(store),
    readonly modelProfiles = new ModelProfileService(store, litellm),
    readonly virtualEmployees = new VirtualEmployeeService(new VirtualEmployeeStore(store.projectId, store.database()), litellm),
    readonly quotas = new ProjectQuotaService(store, litellm),
  ) {}

  async list(): Promise<Agent[]> {
    return Promise.all((await this.store.list()).map((agent) => this.refresh(agent)));
  }

  async get(id: string): Promise<Agent | undefined> {
    const agent = await this.store.get(id);
    return agent ? this.refresh(agent) : undefined;
  }

  async getAudit(id: string): Promise<SandboxAuditEvent[] | undefined> {
    const agent = await this.store.get(id);
    return agent
      ? this.runner.getSandboxAudit(agent.sandboxName)
      : undefined;
  }

  async create(input: CreateAgentInput): Promise<Agent> {
    await this.quotas.assertCanCreate("instances");
    const catalog = await this.extensions.catalog();
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
    const policy = await this.policies.resolve(input.policyId);
    const id = randomUUID();
    const now = new Date().toISOString();
    const sandboxName = agentSandboxName(input.name, id);
    const virtualEmployee = await this.virtualEmployees.get(input.virtualEmployeeId);
    if (virtualEmployee.status !== "active") throw new Error("Select an Active Virtual Employee before creating an Instance.");
    const runtimeConfiguration = await this.virtualEmployees.runtimeConfiguration(virtualEmployee.id);
    const profiles = await this.store.listModelProfiles();
    const profile = profiles.find((item) => item.status === "READY" && item.publicModelAlias === runtimeConfiguration.model);
    if (!profile) throw new Error(`Virtual Employee model ${runtimeConfiguration.model} is not backed by a READY Model Profile.`);
    const gateway = await this.store.getInferenceGateway(profile.gatewayId);
    if (!gateway) throw new Error("The Virtual Employee LiteLLM Gateway is unavailable.");
    const modelAccess = virtualEmployee.modelAccess!;
    const costKeyAlias = `tali-instance-${id}`;
    const serviceAccountId = `tali-instance-${id}`;
    const { teamId, key: instanceKey } = await this.quotas.createInstanceKey({
      alias: costKeyAlias,
      models: [...new Set([runtimeConfiguration.model, ...modelAccess.accessGroups])],
      metadata: {
        managed_by: "tali",
        tali_project_id: this.store.projectId,
        tali_virtual_employee_id: virtualEmployee.id,
        tali_instance_id: id,
        service_account_id: serviceAccountId,
      },
    });
    let agent: Agent = {
      schemaVersion: 1,
      id,
      ...input,
      policyId: policy.id,
      modelDeploymentId: `model-profile:${profile.id}`,
      providerAccountId: gateway.id,
      providerName: "LiteLLM managed",
      model: runtimeConfiguration.model,
      modelType: "llm",
      inferenceMode: "PLATFORM_MANAGED",
      modelProfileId: profile.id,
      modelProfileBindingId: modelAccess.id,
      modelProfileStatus: profile.status,
      modelProfileComplianceDomain: profile.complianceDomain,
      modelProfileCapabilities: profile.capabilities,
      modelProfileKeyFingerprint: `token:${instanceKey.tokenId.slice(-12)}`,
      ...(modelAccess.lastSyncedAt ? { modelProfileLastSynchronizedAt: modelAccess.lastSyncedAt } : {}),
      costKeyAlias,
      liteLLMTokenId: instanceKey.tokenId,
      liteLLMTeamId: teamId,
      serviceAccountId,
      sandboxName,
      status: "PROVISIONING",
      provisioningStage: "QUEUED",
      createdAt: now,
      updatedAt: now,
      logs: ["Agent request accepted. Waiting for the NemoClaw Runtime Host."],
    };
    await this.store.save(agent);
    await this.store.costAnalytics().saveAttribution({
      id: `instance-key:${id}:${instanceKey.tokenId.slice(-12)}`,
      projectId: this.store.projectId,
      environmentId: virtualEmployee.environment,
      instanceId: id,
      instanceName: input.name,
      liteLLMVirtualKeyId: instanceKey.tokenId,
      hashedToken: instanceKey.tokenId,
      virtualKeyAlias: costKeyAlias,
      liteLLMTeamId: teamId,
      providerAccountId: gateway.id,
      validFrom: now,
      createdAt: now,
      updatedAt: now,
    });
    await this.virtualEmployees.bindInstance(virtualEmployee.id, id, "agent-service");
    try {
      agent = await this.store.save(
        applyObservedState(
          agent,
          await this.runner.createSandbox({
            name: agent.sandboxName,
            agentPlatform: agent.agentPlatform,
            providerName: "LiteLLM",
            model: runtimeConfiguration.model,
            inferenceEndpoint: runtimeConfiguration.endpoint,
            policyYaml: policy.policyYaml,
            systemPrompt: input.systemPrompt,
            apiKey: instanceKey.secret,
            virtualEmployeeId: virtualEmployee.id,
            instanceId: id,
          }),
        ),
      );
    } catch (error) {
      await this.litellm.revokeKey(instanceKey.tokenId).catch(() => undefined);
      await this.closeInstanceAttributions(id);
      await this.virtualEmployees.unbindInstance(id, "agent-service").catch(() => undefined);
      agent = await this.store.save({
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
    const agent = await this.store.get(id);
    if (!agent) return false;
    await this.store.save({
      ...agent,
      status: "DESTROYING",
      updatedAt: new Date().toISOString(),
    });
    await this.runner.destroySandbox(agent.sandboxName, agent.agentPlatform);
    if (agent.liteLLMTokenId) await this.litellm.revokeKey(agent.liteLLMTokenId);
    await this.closeInstanceAttributions(id);
    await this.virtualEmployees.unbindInstance(id, "agent-service");
    await this.store.delete(id);
    return true;
  }

  async bindVirtualEmployee(id: string, virtualEmployeeId: string, actor: string): Promise<Agent> {
    const current = await this.store.get(id);
    if (!current) throw new Error("Agent Instance not found.");
    if (current.virtualEmployeeId === virtualEmployeeId) return current;
    const employee = await this.virtualEmployees.get(virtualEmployeeId);
    if (employee.status !== "active") throw new Error("Only an Active Virtual Employee can be bound to an Instance.");
    const configuration = await this.virtualEmployees.runtimeConfiguration(virtualEmployeeId);
    const profile = (await this.store.listModelProfiles()).find((item) => item.status === "READY" && item.publicModelAlias === configuration.model);
    if (!profile) throw new Error(`Virtual Employee model ${configuration.model} is not backed by a READY Model Profile.`);
    const gateway = await this.store.getInferenceGateway(profile.gatewayId);
    if (!gateway) throw new Error("The Virtual Employee LiteLLM Gateway is unavailable.");
    const policy = await this.policies.resolve(current.policyId);
    const access = employee.modelAccess!;
    const keyAlias = `tali-instance-${id}`;
    const serviceAccountId = `tali-instance-${id}`;
    const { teamId, key: instanceKey } = await this.quotas.createInstanceKey({
      alias: keyAlias,
      models: [...new Set([configuration.model, ...access.accessGroups])],
      metadata: {
        managed_by: "tali",
        tali_project_id: this.store.projectId,
        tali_virtual_employee_id: virtualEmployeeId,
        tali_instance_id: id,
        service_account_id: serviceAccountId,
      },
    });

    await this.runner.destroySandbox(current.sandboxName, current.agentPlatform);
    let observed: RunnerSandbox;
    try {
      observed = await this.runner.createSandbox({
        name: current.sandboxName,
        agentPlatform: current.agentPlatform,
        providerName: "LiteLLM",
        model: configuration.model,
        inferenceEndpoint: configuration.endpoint,
        policyYaml: policy.policyYaml,
        systemPrompt: current.systemPrompt,
        apiKey: instanceKey.secret,
        virtualEmployeeId,
        instanceId: id,
      });
    } catch (error) {
      await this.litellm.revokeKey(instanceKey.tokenId).catch(() => undefined);
      throw error;
    }
    if (current.liteLLMTokenId) await this.litellm.revokeKey(current.liteLLMTokenId);
    await this.closeInstanceAttributions(id);
    const now = new Date().toISOString();
    await this.store.costAnalytics().saveAttribution({
      id: `instance-key:${id}:${instanceKey.tokenId.slice(-12)}`,
      projectId: this.store.projectId,
      environmentId: employee.environment,
      instanceId: id,
      instanceName: current.name,
      liteLLMVirtualKeyId: instanceKey.tokenId,
      hashedToken: instanceKey.tokenId,
      virtualKeyAlias: keyAlias,
      liteLLMTeamId: teamId,
      providerAccountId: gateway.id,
      validFrom: now,
      createdAt: now,
      updatedAt: now,
    });
    await this.virtualEmployees.unbindInstance(id, actor);
    await this.virtualEmployees.bindInstance(virtualEmployeeId, id, actor);
    return this.store.save(applyObservedState({
      ...current,
      virtualEmployeeId,
      model: configuration.model,
      modelDeploymentId: `model-profile:${profile.id}`,
      providerAccountId: gateway.id,
      modelProfileId: profile.id,
      modelProfileBindingId: access.id,
      modelProfileStatus: profile.status,
      modelProfileComplianceDomain: profile.complianceDomain,
      modelProfileCapabilities: profile.capabilities,
      modelProfileKeyFingerprint: `token:${instanceKey.tokenId.slice(-12)}`,
      costKeyAlias: keyAlias,
      liteLLMTokenId: instanceKey.tokenId,
      liteLLMTeamId: teamId,
      serviceAccountId,
      updatedAt: new Date().toISOString(),
      logs: [...current.logs, `Virtual Employee changed to ${employee.displayName}.`],
    }, observed));
  }

  async unbindVirtualEmployee(id: string, actor: string): Promise<Agent> {
    const current = await this.store.get(id);
    if (!current) throw new Error("Agent Instance not found.");
    await this.runner.destroySandbox(current.sandboxName, current.agentPlatform);
    if (current.liteLLMTokenId) await this.litellm.revokeKey(current.liteLLMTokenId);
    await this.closeInstanceAttributions(id);
    await this.virtualEmployees.unbindInstance(id, actor);
    return this.store.save({
      ...current,
      status: "FAILED",
      updatedAt: new Date().toISOString(),
      error: "Virtual Employee unbound. Bind an Active Virtual Employee before restarting this Instance.",
      logs: [...current.logs, "Virtual Employee unbound; runtime stopped to prevent credential reuse."],
    });
  }

  private async refresh(agent: Agent): Promise<Agent> {
    if (agent.status === "FAILED") return agent;
    try {
      return await this.store.save(
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

  private async closeInstanceAttributions(instanceId: string): Promise<void> {
    const now = new Date();
    await this.store.database().costAttributionMappingRecord.updateMany({
      where: {
        projectId: this.store.projectId,
        instanceId,
        validTo: null,
      },
      data: { validTo: now, updatedAt: now },
    });
  }
}
