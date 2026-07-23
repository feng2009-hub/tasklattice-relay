import { createHash, randomUUID } from "node:crypto";
import type {
  ComplianceDomain,
  CreateInferenceGroupInput,
  InferenceGateway,
  InferenceGroup,
  InferenceGroupAuditEvent,
  InferenceGroupBinding,
  UpdateInferenceGroupInput,
} from "@tasklattice/contracts";
import { AgentStore } from "../data/agent-store";
import { LiteLLMClient, type LiteLLMAdminClient } from "../providers/litellm-client";

const defaultCapabilities = {
  automaticRouting: "UNKNOWN",
  routerType: "UNKNOWN",
  sessionAffinity: "UNKNOWN",
  adaptiveRouting: "UNKNOWN",
  failover: "UNKNOWN",
  generalFallback: "UNKNOWN",
  contextWindowFallback: "UNKNOWN",
  contentPolicyFallback: "UNKNOWN",
  retries: "UNKNOWN",
  requestAudit: "UNKNOWN",
} as const;

export class InferenceGroupResolver {
  constructor(private readonly store: AgentStore) {}

  async resolve(id?: string): Promise<InferenceGroup> {
    let group: InferenceGroup;
    if (id) {
      const selected = await this.store.getInferenceGroup(id);
      if (!selected) throw new Error("The selected Inference Group is unavailable.");
      group = selected;
    } else {
      const defaults = (await this.store.listInferenceGroups()).filter((candidate) => candidate.isDefault);
      if (defaults.length !== 1)
        throw new Error(defaults.length ? "Multiple default Inference Groups are configured." : "No default Inference Group is configured.");
      group = defaults[0]!;
    }
    if (group.status !== "READY")
      throw new Error(`The ${id ? "selected" : "default"} Inference Group is ${group.status.toLowerCase().replaceAll("_", " ")}.`);
    return group;
  }

  resolveDefault(): Promise<InferenceGroup> {
    return this.resolve();
  }
}

export class InferenceGroupService {
  readonly resolver: InferenceGroupResolver;

  constructor(
    readonly store = new AgentStore(),
    readonly litellm: LiteLLMAdminClient = new LiteLLMClient(),
  ) {
    this.resolver = new InferenceGroupResolver(store);
  }

  async listGateways(): Promise<InferenceGateway[]> {
    await this.ensureDefaultGateway();
    return this.store.listInferenceGateways();
  }

  async list(): Promise<InferenceGroup[]> {
    await this.ensureDefaultGateway();
    return Promise.all((await this.store.listInferenceGroups()).map((group) => this.withConsumerCount(group)));
  }

  async get(id: string): Promise<InferenceGroup | undefined> {
    const group = await this.store.getInferenceGroup(id);
    return group ? await this.withConsumerCount(group) : undefined;
  }

  async create(input: CreateInferenceGroupInput, actor = "control-api"): Promise<InferenceGroup> {
    await this.ensureDefaultGateway();
    if (!await this.store.getInferenceGateway(input.gatewayId)) throw new Error("Select an available LiteLLM Gateway.");
    if (input.isDefault && (await this.store.listInferenceGroups()).some((group) => group.isDefault))
      throw new Error("A default Inference Group already exists. Change the existing default first.");
    const now = new Date().toISOString();
    const id = randomUUID();
    const group: InferenceGroup = {
      id,
      name: input.name,
      description: input.description,
      gatewayId: input.gatewayId,
      managementMode: "LITELLM_MANAGED",
      publicModelAlias: input.publicModelAlias,
      complianceDomain: input.complianceDomain,
      status: "DRAFT",
      isDefault: false,
      keyPolicy: input.keyPolicy,
      auditPolicy: input.auditPolicy,
      capabilities: defaultCapabilities,
      conditions: [],
      configurationHash: configurationHash(input),
      observedGeneration: 1,
      validationMessage: "Waiting for LiteLLM validation.",
      consumers: 0,
      createdAt: now,
      updatedAt: now,
    };
    await this.store.saveInferenceGroup(group);
    await this.audit(group, "inference_group.created", actor, "SUCCESS", "Inference Group definition stored.");
    const validated = await this.validate(id, actor);
    if (input.isDefault && validated.status === "READY") return this.update(id, { isDefault: true }, actor);
    return validated;
  }

  async update(id: string, input: UpdateInferenceGroupInput, actor = "control-api"): Promise<InferenceGroup> {
    const current = await this.require(id);
    if (input.isDefault && !current.isDefault && (await this.store.listInferenceGroups()).some((group) => group.isDefault && group.id !== id))
      throw new Error("A default Inference Group already exists. Clear it before assigning another.");
    if (input.isDefault && current.status !== "READY") throw new Error("Only a READY Inference Group can be the default.");
    const values = withoutUndefined(input);
    const next: InferenceGroup = {
      ...current,
      name: values.name ?? current.name,
      description: values.description ?? current.description,
      isDefault: values.isDefault ?? current.isDefault,
      keyPolicy: values.keyPolicy ?? current.keyPolicy,
      auditPolicy: values.auditPolicy ?? current.auditPolicy,
      status: input.suspended === true
        ? "SUSPENDED"
        : input.suspended === false && current.status === "SUSPENDED"
          ? "DRAFT"
          : current.status,
      updatedAt: new Date().toISOString(),
      configurationHash: configurationHash({ ...current, ...values }),
      observedGeneration: current.observedGeneration + 1,
      validationMessage: current.validationMessage,
    };
    await this.store.saveInferenceGroup(next);
    await this.audit(next, input.suspended === true ? "inference_group.suspended" : "inference_group.updated", actor, "SUCCESS", "Inference Group policy updated.");
    return this.withConsumerCount(next);
  }

  async validate(id: string, actor = "control-api"): Promise<InferenceGroup> {
    const current = await this.require(id);
    const gateway = await this.store.getInferenceGateway(current.gatewayId);
    if (!gateway) throw new Error("The Inference Group gateway is unavailable.");
    if (current.status === "SUSPENDED") throw new Error("Resume the Inference Group before validating it.");
    await this.store.saveInferenceGroup({ ...current, status: "VALIDATING", updatedAt: new Date().toISOString() });
    if (gateway.complianceDomain !== current.complianceDomain) {
      const reason = `Gateway compliance domain ${gateway.complianceDomain} does not match Inference Group domain ${current.complianceDomain}.`;
      const next = await this.store.saveInferenceGroup({
        ...current,
        status: "NON_COMPLIANT",
        isDefault: false,
        capabilities: defaultCapabilities,
        conditions: [
          { type: "GATEWAY", status: "PASS", reason: `Bound to ${gateway.name}.` },
          { type: "COMPLIANCE", status: "FAIL", reason },
        ],
        validationMessage: reason,
        lastSynchronizedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await this.audit(next, "inference_group.compliance_failed", actor, "FAILED", reason);
      return this.withConsumerCount(next);
    }
    try {
      if (!this.litellm.inspectInferenceGroup) throw new Error("The configured LiteLLM adapter does not support Router inspection.");
      const inspection = await this.litellm.inspectInferenceGroup(current.publicModelAlias);
      const conditions: InferenceGroup["conditions"] = [];
      conditions.push({ type: "GATEWAY", status: "PASS", reason: `LiteLLM Gateway ${gateway.name} is reachable.` });
      conditions.push({
        type: "BINDING",
        status: inspection.exists ? "PASS" : "FAIL",
        reason: inspection.exists ? `${inspection.modelCount} LiteLLM deployment(s) expose this alias.` : "The public model alias was not found in LiteLLM.",
      });
      const configuredDomains = new Set(inspection.complianceDomains);
      const compliancePass = !inspection.complianceUnknown && configuredDomains.size === 1 && configuredDomains.has(current.complianceDomain);
      conditions.push({
        type: "COMPLIANCE",
        status: inspection.complianceUnknown ? "UNKNOWN" : compliancePass ? "PASS" : "FAIL",
        reason: inspection.complianceUnknown
          ? "One or more LiteLLM deployments do not declare model_info.compliance_domain."
          : compliancePass
            ? `All backing deployments are declared ${current.complianceDomain}.`
            : `Backing deployments do not exclusively match ${current.complianceDomain}.`,
      });
      conditions.push({
        type: "CAPABILITY",
        status: inspection.unsupportedReason ? "FAIL" : "PASS",
        reason: inspection.unsupportedReason ?? "Routing capabilities were read from LiteLLM.",
      });
      const status: InferenceGroup["status"] = inspection.unsupportedReason
        ? "UNSUPPORTED"
        : !inspection.exists
          ? "DEGRADED"
          : !compliancePass
            ? "NON_COMPLIANT"
            : "READY";
      const nextConfigurationHash = configurationHash({
        gatewayId: current.gatewayId,
        publicModelAlias: current.publicModelAlias,
        complianceDomain: current.complianceDomain,
        keyPolicy: current.keyPolicy,
        auditPolicy: current.auditPolicy,
        liteLLM: inspection.configurationHash,
      });
      const next = await this.store.saveInferenceGroup({
        ...current,
        status,
        isDefault: current.isDefault,
        capabilities: inspection.capabilities,
        conditions,
        configurationHash: nextConfigurationHash,
        observedGeneration: current.configurationHash === nextConfigurationHash
          ? current.observedGeneration
          : current.observedGeneration + 1,
        validationMessage: conditions.find((condition) => condition.status !== "PASS")?.reason ?? "LiteLLM binding is ready.",
        ...(inspection.version ? { liteLLMVersion: inspection.version } : {}),
        lastSynchronizedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await this.store.saveInferenceGateway({
        ...gateway,
        status: "READY",
        validationMessage: "LiteLLM management API is reachable.",
        validatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const changed = current.status !== next.status || JSON.stringify(current.capabilities) !== JSON.stringify(next.capabilities) || JSON.stringify(current.conditions) !== JSON.stringify(next.conditions);
      if (changed) await this.audit(next, "inference_group.sync_changed", actor, "SUCCESS", "Effective LiteLLM status or capabilities changed.");
      await this.audit(next, status === "NON_COMPLIANT" ? "inference_group.compliance_failed" : "inference_group.validated", actor, status === "READY" ? "SUCCESS" : "FAILED", conditions.find((condition) => condition.status !== "PASS")?.reason ?? "Binding is ready.");
      return this.withConsumerCount(next);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "LiteLLM validation failed.";
      const next = await this.store.saveInferenceGroup({
        ...current,
        status: "DEGRADED",
        isDefault: current.isDefault,
        capabilities: defaultCapabilities,
        conditions: [{ type: "GATEWAY", status: "FAIL", reason }],
        validationMessage: reason,
        lastSynchronizedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await this.store.saveInferenceGateway({
        ...gateway,
        status: "DEGRADED",
        validationMessage: reason,
        validatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await this.audit(next, "inference_group.validated", actor, "FAILED", reason);
      return this.withConsumerCount(next);
    }
  }

  async bindAgent(agentId: string, inferenceGroupId?: string): Promise<{ binding: InferenceGroupBinding; group: InferenceGroup; gateway: InferenceGateway; secret: string }> {
    await this.ensureDefaultGateway();
    let group = await this.resolver.resolve(inferenceGroupId);
    const gateway = await this.store.getInferenceGateway(group.gatewayId);
    if (!gateway) throw new Error("The Inference Group gateway is unavailable.");
    if (gateway.complianceDomain !== group.complianceDomain)
      throw new Error("The Inference Group and LiteLLM Gateway compliance domains do not match.");
    if (!group.conditions.some((condition) => condition.type === "COMPLIANCE" && condition.status === "PASS"))
      throw new Error("The Inference Group compliance validation is not current.");
    if (!this.litellm.createInferenceGroupKey || !this.litellm.createInferenceGroupTeam)
      throw new Error("The LiteLLM adapter does not support Team-scoped Virtual Keys.");
    let teamId = group.liteLLMTeamId;
    if (!teamId) {
      teamId = await this.litellm.createInferenceGroupTeam({
        alias: `tasklattice-${group.id}`,
        modelAlias: group.publicModelAlias,
        inferenceGroupId: group.id,
        complianceDomain: group.complianceDomain,
      });
      group = await this.store.saveInferenceGroup({ ...group, liteLLMTeamId: teamId, updatedAt: new Date().toISOString() });
    }
    const keyAlias = `tasklattice/${group.id.slice(0, 8)}/${agentId.slice(0, 8)}`;
    const key = await this.litellm.createInferenceGroupKey({
      agentId,
      alias: keyAlias,
      modelAlias: group.publicModelAlias,
      teamId,
      inferenceGroupId: group.id,
      complianceDomain: group.complianceDomain,
    });
    const now = new Date().toISOString();
    const binding: InferenceGroupBinding = {
      id: randomUUID(),
      inferenceGroupId: group.id,
      agentId,
      liteLLMTeamId: teamId,
      liteLLMTokenId: key.tokenId,
      keyAlias,
      keyFingerprint: fingerprint(key.secret),
      status: "ACTIVE",
      createdAt: now,
    };
    await this.store.saveInferenceGroupBinding(binding);
    await this.audit(group, "inference_binding.created", "agent-service", "SUCCESS", "Per-Instance Team-scoped Virtual Key created.", agentId);
    await this.audit(group, "virtual_key.created", "agent-service", "SUCCESS", `Virtual Key fingerprint ${binding.keyFingerprint}.`, agentId);
    return { binding, group: await this.withConsumerCount(group), gateway, secret: key.secret };
  }

  async unbindAgent(agentId: string): Promise<void> {
    const binding = await this.store.getInferenceGroupBindingForAgent(agentId);
    if (!binding || binding.status === "REVOKED") return;
    const group = await this.require(binding.inferenceGroupId);
    await this.litellm.revokeKey(binding.liteLLMTokenId);
    await this.store.saveInferenceGroupBinding({ ...binding, status: "REVOKED", revokedAt: new Date().toISOString() });
    await this.audit(group, "inference_binding.revoked", "agent-service", "SUCCESS", "Instance binding revoked.", agentId);
    await this.audit(group, "virtual_key.revoked", "agent-service", "SUCCESS", `Virtual Key fingerprint ${binding.keyFingerprint}.`, agentId);
  }

  async consumers(id: string): Promise<InferenceGroupBinding[]> {
    await this.require(id);
    return (await this.store.listInferenceGroupBindings(id)).filter((binding) => binding.status === "ACTIVE");
  }

  async auditEvents(id: string): Promise<InferenceGroupAuditEvent[]> {
    await this.require(id);
    return this.store.listInferenceGroupAudit(id);
  }

  async delete(id: string, actor = "control-api"): Promise<void> {
    const group = await this.require(id);
    if ((await this.consumers(id)).length) throw new Error("Remove all Consumers before deleting this Inference Group.");
    if (group.liteLLMTeamId && this.litellm.deleteInferenceGroupTeam)
      await this.litellm.deleteInferenceGroupTeam(group.liteLLMTeamId);
    await this.audit(group, "inference_group.deleted", actor, "SUCCESS", "Inference Group deleted.");
    await this.store.deleteInferenceGroup(id);
  }

  private async ensureDefaultGateway(): Promise<void> {
    if ((await this.store.listInferenceGateways()).length) return;
    const now = new Date().toISOString();
    await this.store.saveInferenceGateway({
      id: "litellm-default",
      name: process.env.LITELLM_GATEWAY_NAME ?? "Primary LiteLLM Gateway",
      baseUrl: this.litellm.baseUrl,
      adminUiUrl: trustedAdminUiUrl(process.env.LITELLM_ADMIN_UI_URL, this.litellm.baseUrl),
      complianceDomain: configuredGatewayComplianceDomain(),
      credentialSource: "ENVIRONMENT",
      status: "UNKNOWN",
      validationMessage: "The gateway has not been validated yet.",
      createdAt: now,
      updatedAt: now,
    });
  }

  private async require(id: string): Promise<InferenceGroup> {
    const group = await this.store.getInferenceGroup(id);
    if (!group) throw new Error("Inference Group not found.");
    return group;
  }

  private async withConsumerCount(group: InferenceGroup): Promise<InferenceGroup> {
    return { ...group, consumers: (await this.store.listInferenceGroupBindings(group.id)).filter((binding) => binding.status === "ACTIVE").length };
  }

  private async audit(group: InferenceGroup, type: string, actor: string, result: InferenceGroupAuditEvent["result"], reason: string, agentId?: string): Promise<void> {
    await this.store.appendInferenceGroupAudit({
      eventId: randomUUID(),
      timestamp: new Date().toISOString(),
      actor,
      type,
      inferenceGroupId: group.id,
      ...(agentId ? { agentId } : {}),
      configurationHash: group.configurationHash,
      complianceDomain: group.complianceDomain,
      result,
      reason,
    });
  }
}

function configurationHash(input: object): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(sortForHash(input))).digest("hex")}`;
}

function sortForHash(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForHash);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, nested]) => [key, sortForHash(nested)]));
  return value;
}

function fingerprint(secret: string): string {
  return `sha256:${createHash("sha256").update(secret).digest("hex").slice(0, 12)}`;
}

function withoutUndefined<T extends object>(input: T): Partial<T> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<T>;
}

function trustedAdminUiUrl(configured: string | undefined, baseUrl: string): string {
  const url = new URL(configured ?? baseUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("LITELLM_ADMIN_UI_URL must use HTTP or HTTPS.");
  return url.toString().replace(/\/$/, "");
}

function configuredGatewayComplianceDomain(): ComplianceDomain {
  const value = process.env.LITELLM_COMPLIANCE_DOMAIN ?? "GLOBAL";
  if (value !== "CN_MAINLAND" && value !== "GLOBAL")
    throw new Error("LITELLM_COMPLIANCE_DOMAIN must be CN_MAINLAND or GLOBAL.");
  return value;
}

export function complianceDomainsMatch(expected: ComplianceDomain, actual: readonly ComplianceDomain[], hasUnknown: boolean): boolean {
  return !hasUnknown && new Set(actual).size === 1 && actual[0] === expected;
}
