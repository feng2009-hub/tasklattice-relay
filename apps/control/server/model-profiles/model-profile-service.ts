import { createHash, randomUUID } from "node:crypto";
import type {
  ComplianceDomain,
  CreateModelProfileInput,
  InferenceGateway,
  ModelProfile,
  ModelProfileAuditEvent,
  ModelProfileBinding,
  UpdateModelProfileInput,
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

export class ModelProfileResolver {
  constructor(private readonly store: AgentStore) {}

  async resolve(id?: string): Promise<ModelProfile> {
    let profile: ModelProfile;
    if (id) {
      const selected = await this.store.getModelProfile(id);
      if (!selected) throw new Error("The selected Model Profile is unavailable.");
      profile = selected;
    } else {
      const defaults = (await this.store.listModelProfiles()).filter((candidate) => candidate.isDefault);
      if (defaults.length !== 1)
        throw new Error(defaults.length ? "Multiple default Model Profiles are configured." : "No default Model Profile is configured.");
      profile = defaults[0]!;
    }
    if (profile.status !== "READY")
      throw new Error(`The ${id ? "selected" : "default"} Model Profile is ${profile.status.toLowerCase().replaceAll("_", " ")}.`);
    return profile;
  }

  resolveDefault(): Promise<ModelProfile> {
    return this.resolve();
  }
}

export class ModelProfileService {
  readonly resolver: ModelProfileResolver;

  constructor(
    readonly store = new AgentStore(),
    readonly litellm: LiteLLMAdminClient = new LiteLLMClient(),
  ) {
    this.resolver = new ModelProfileResolver(store);
  }

  async listGateways(): Promise<InferenceGateway[]> {
    await this.ensureDefaultGateway();
    return this.store.listInferenceGateways();
  }

  async list(): Promise<ModelProfile[]> {
    await this.ensureDefaultGateway();
    return Promise.all((await this.store.listModelProfiles()).map((profile) => this.withConsumerCount(profile)));
  }

  async get(id: string): Promise<ModelProfile | undefined> {
    const profile = await this.store.getModelProfile(id);
    return profile ? await this.withConsumerCount(profile) : undefined;
  }

  async create(input: CreateModelProfileInput, actor = "control-api"): Promise<ModelProfile> {
    await this.ensureDefaultGateway();
    if (!await this.store.getInferenceGateway(input.gatewayId)) throw new Error("Select an available LiteLLM Gateway.");
    if (input.isDefault && (await this.store.listModelProfiles()).some((profile) => profile.isDefault))
      throw new Error("A default Model Profile already exists. Change the existing default first.");
    const now = new Date().toISOString();
    const id = randomUUID();
    const profile: ModelProfile = {
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
    await this.store.saveModelProfile(profile);
    await this.audit(profile, "model_profile.created", actor, "SUCCESS", "Model Profile definition stored.");
    const refreshed = await this.refresh(id, actor);
    if (input.isDefault && refreshed.status === "READY") return this.update(id, { isDefault: true }, actor);
    return refreshed;
  }

  async update(id: string, input: UpdateModelProfileInput, actor = "control-api"): Promise<ModelProfile> {
    const current = await this.require(id);
    if (input.isDefault && !current.isDefault && (await this.store.listModelProfiles()).some((profile) => profile.isDefault && profile.id !== id))
      throw new Error("A default Model Profile already exists. Clear it before assigning another.");
    if (input.isDefault && current.status !== "READY") throw new Error("Only a READY Model Profile can be the default.");
    const values = withoutUndefined(input);
    const next: ModelProfile = {
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
    await this.store.saveModelProfile(next);
    await this.audit(next, input.suspended === true ? "model_profile.suspended" : "model_profile.updated", actor, "SUCCESS", "Model Profile policy updated.");
    return this.withConsumerCount(next);
  }

  async refresh(id: string, actor = "control-api"): Promise<ModelProfile> {
    const current = await this.require(id);
    const gateway = await this.store.getInferenceGateway(current.gatewayId);
    if (!gateway) throw new Error("The Model Profile gateway is unavailable.");
    if (current.status === "SUSPENDED") throw new Error("Resume the Model Profile before validating it.");
    await this.store.saveModelProfile({ ...current, status: "VALIDATING", updatedAt: new Date().toISOString() });
    if (gateway.complianceDomain !== current.complianceDomain) {
      const reason = `Gateway compliance domain ${gateway.complianceDomain} does not match Model Profile domain ${current.complianceDomain}.`;
      const next = await this.store.saveModelProfile({
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
      await this.audit(next, "model_profile.compliance_failed", actor, "FAILED", reason);
      return this.withConsumerCount(next);
    }
    try {
      if (!this.litellm.inspectModelProfile) throw new Error("The configured LiteLLM adapter does not support Router inspection.");
      const inspection = await this.litellm.inspectModelProfile(current.publicModelAlias);
      const conditions: ModelProfile["conditions"] = [];
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
      const status: ModelProfile["status"] = inspection.unsupportedReason
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
      const next = await this.store.saveModelProfile({
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
      if (changed) await this.audit(next, "model_profile.sync_changed", actor, "SUCCESS", "Effective LiteLLM status or capabilities changed.");
      await this.audit(next, status === "NON_COMPLIANT" ? "model_profile.compliance_failed" : "model_profile.validated", actor, status === "READY" ? "SUCCESS" : "FAILED", conditions.find((condition) => condition.status !== "PASS")?.reason ?? "Binding is ready.");
      return this.withConsumerCount(next);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "LiteLLM validation failed.";
      const next = await this.store.saveModelProfile({
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
      await this.audit(next, "model_profile.validated", actor, "FAILED", reason);
      return this.withConsumerCount(next);
    }
  }

  async bindAgent(agentId: string, modelProfileId?: string): Promise<{ binding: ModelProfileBinding; profile: ModelProfile; gateway: InferenceGateway; secret: string }> {
    await this.ensureDefaultGateway();
    let profile = await this.resolver.resolve(modelProfileId);
    const gateway = await this.store.getInferenceGateway(profile.gatewayId);
    if (!gateway) throw new Error("The Model Profile gateway is unavailable.");
    if (gateway.complianceDomain !== profile.complianceDomain)
      throw new Error("The Model Profile and LiteLLM Gateway compliance domains do not match.");
    if (!profile.conditions.some((condition) => condition.type === "COMPLIANCE" && condition.status === "PASS"))
      throw new Error("The Model Profile compliance validation is not current.");
    if (!this.litellm.createModelProfileKey || !this.litellm.createModelProfileTeam)
      throw new Error("The LiteLLM adapter does not support Team-scoped Virtual Keys.");
    let teamId = profile.liteLLMTeamId;
    if (!teamId) {
      teamId = await this.litellm.createModelProfileTeam({
        alias: `tasklattice-${profile.id}`,
        modelAlias: profile.publicModelAlias,
        modelProfileId: profile.id,
        complianceDomain: profile.complianceDomain,
      });
      profile = await this.store.saveModelProfile({ ...profile, liteLLMTeamId: teamId, updatedAt: new Date().toISOString() });
    }
    const keyAlias = `tasklattice/${profile.id.slice(0, 8)}/${agentId.slice(0, 8)}`;
    const key = await this.litellm.createModelProfileKey({
      agentId,
      alias: keyAlias,
      modelAlias: profile.publicModelAlias,
      teamId,
      modelProfileId: profile.id,
      complianceDomain: profile.complianceDomain,
    });
    const now = new Date().toISOString();
    const binding: ModelProfileBinding = {
      id: randomUUID(),
      modelProfileId: profile.id,
      agentId,
      liteLLMTeamId: teamId,
      liteLLMTokenId: key.tokenId,
      keyAlias,
      keyFingerprint: fingerprint(key.secret),
      status: "ACTIVE",
      createdAt: now,
    };
    await this.store.saveModelProfileBinding(binding);
    await this.audit(profile, "model_profile_binding.created", "agent-service", "SUCCESS", "Per-Instance Team-scoped Virtual Key created.", agentId);
    await this.audit(profile, "virtual_key.created", "agent-service", "SUCCESS", `Virtual Key fingerprint ${binding.keyFingerprint}.`, agentId);
    return { binding, profile: await this.withConsumerCount(profile), gateway, secret: key.secret };
  }

  async unbindAgent(agentId: string): Promise<void> {
    const binding = await this.store.getModelProfileBindingForAgent(agentId);
    if (!binding || binding.status === "REVOKED") return;
    const profile = await this.require(binding.modelProfileId);
    await this.litellm.revokeKey(binding.liteLLMTokenId);
    await this.store.saveModelProfileBinding({ ...binding, status: "REVOKED", revokedAt: new Date().toISOString() });
    await this.audit(profile, "model_profile_binding.revoked", "agent-service", "SUCCESS", "Instance binding revoked.", agentId);
    await this.audit(profile, "virtual_key.revoked", "agent-service", "SUCCESS", `Virtual Key fingerprint ${binding.keyFingerprint}.`, agentId);
  }

  async consumers(id: string): Promise<ModelProfileBinding[]> {
    await this.require(id);
    return (await this.store.listModelProfileBindings(id)).filter((binding) => binding.status === "ACTIVE");
  }

  async auditEvents(id: string): Promise<ModelProfileAuditEvent[]> {
    await this.require(id);
    return this.store.listModelProfileAudit(id);
  }

  async delete(id: string, actor = "control-api"): Promise<void> {
    const profile = await this.require(id);
    if ((await this.consumers(id)).length) throw new Error("Remove all Consumers before deleting this Model Profile.");
    if (profile.liteLLMTeamId && this.litellm.deleteModelProfileTeam)
      await this.litellm.deleteModelProfileTeam(profile.liteLLMTeamId);
    await this.audit(profile, "model_profile.deleted", actor, "SUCCESS", "Model Profile deleted.");
    await this.store.deleteModelProfile(id);
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

  private async require(id: string): Promise<ModelProfile> {
    const profile = await this.store.getModelProfile(id);
    if (!profile) throw new Error("Model Profile not found.");
    return profile;
  }

  private async withConsumerCount(profile: ModelProfile): Promise<ModelProfile> {
    return { ...profile, consumers: (await this.store.listModelProfileBindings(profile.id)).filter((binding) => binding.status === "ACTIVE").length };
  }

  private async audit(profile: ModelProfile, type: string, actor: string, result: ModelProfileAuditEvent["result"], reason: string, agentId?: string): Promise<void> {
    await this.store.appendModelProfileAudit({
      eventId: randomUUID(),
      timestamp: new Date().toISOString(),
      actor,
      type,
      modelProfileId: profile.id,
      ...(agentId ? { agentId } : {}),
      configurationHash: profile.configurationHash,
      complianceDomain: profile.complianceDomain,
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
