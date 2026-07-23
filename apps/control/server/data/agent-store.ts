import { createHash } from "node:crypto";
import type {
  Agent,
  AgentSpecializationDefinition,
  ExtensionCatalog,
  ExtensionResourceKind,
  KnowledgeSourceDefinition,
  InferenceGateway,
  ModelProfile,
  ModelProfileAuditEvent,
  ModelProfileBinding,
  McpServerDefinition,
  ModelDeployment,
  ProviderAccount,
  ProviderKind,
  SandboxPolicy,
  SkillDefinition,
} from "@tasklattice/contracts";
import { prisma } from "../db/prisma";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { CostAnalyticsStore } from "../providers/cost-analytics-store";

type ExtensionDelegateName =
  | "extensionSkillRecord"
  | "extensionMcpServerRecord"
  | "extensionKnowledgeSourceRecord"
  | "agentSpecializationRecord";

function costKeyIdentifier(value: string): string {
  return value.startsWith("sha256:")
    ? value
    : `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function decode<T>(payload: Prisma.JsonValue): T {
  return payload as T;
}

function jsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function parseAgent(payload: string | Prisma.JsonValue): Agent {
  const agent = (typeof payload === "string" ? JSON.parse(payload) : payload) as Partial<Agent>;
  if (
    agent.schemaVersion !== 1 ||
    typeof agent.id !== "string" ||
    typeof agent.name !== "string" ||
    typeof agent.sandboxName !== "string" ||
    typeof agent.model !== "string" ||
    typeof agent.systemPrompt !== "string" ||
    typeof agent.createdAt !== "string" ||
    typeof agent.updatedAt !== "string" ||
    !Array.isArray(agent.logs) ||
    agent.inferenceMode !== "PLATFORM_MANAGED" ||
    typeof agent.modelProfileId !== "string" ||
    typeof agent.modelProfileBindingId !== "string" ||
    typeof agent.modelProfileKeyFingerprint !== "string" ||
    !agent.modelProfileCapabilities ||
    !agent.modelProfileComplianceDomain ||
    !agent.modelProfileStatus
  ) throw new Error("Stored Instance data is incomplete.");
  return agent as Agent;
}

function parseCurrentAgent(payload: Prisma.JsonValue): Agent | undefined {
  const candidate = payload as Partial<Agent>;
  return candidate.schemaVersion === 1 ? parseAgent(payload) : undefined;
}

function parseProviderAccount(payload: Prisma.JsonValue): ProviderAccount {
  const account = payload as Partial<ProviderAccount> & { presetId?: string; endpoint?: string };
  const legacyKind: ProviderKind =
    account.presetId === "kimi-cn" || account.presetId === "kimi-global"
      ? "moonshot"
      : (account.presetId as ProviderKind | undefined) ?? "custom-openai-compatible";
  return {
    ...account,
    id: account.id ?? "",
    name: account.name ?? "Provider",
    providerKind: account.providerKind ?? legacyKind,
    presetId: (account.presetId as ProviderAccount["presetId"] | undefined) ?? legacyKind,
    endpoint: account.endpoint ?? "",
    config: account.config ?? { endpoint: account.endpoint ?? "" },
    complianceDomain: account.complianceDomain ?? "GLOBAL",
    endpointRegion: account.endpointRegion ?? "unspecified",
    crossBorderTransfer: account.crossBorderTransfer ?? false,
    discoveredModels: account.discoveredModels ?? [],
    credentialState: "STORED",
    status: account.status ?? "FAILED",
    checks: account.checks ?? [],
    validationMessage: account.validationMessage ?? "Provider requires validation.",
    createdAt: account.createdAt ?? new Date(0).toISOString(),
    updatedAt: account.updatedAt ?? account.createdAt ?? new Date(0).toISOString(),
  };
}

function parseModelDeployment(payload: Prisma.JsonValue): ModelDeployment {
  const deployment = payload as Partial<ModelDeployment>;
  return { ...deployment, isDefault: deployment.isDefault ?? false } as ModelDeployment;
}

export class AgentStore {
  private readonly costs: CostAnalyticsStore;
  readonly workspaceId: string;
  private readonly db: PrismaClient;

  constructor(
    workspaceId = process.env.TALI_BOOTSTRAP_WORKSPACE_ID ?? "individual",
    db?: PrismaClient,
  ) {
    this.workspaceId = workspaceId === ":memory:" || workspaceId.includes("/")
      ? process.env.TALI_BOOTSTRAP_WORKSPACE_ID ?? "individual"
      : workspaceId;
    this.db = db ?? prisma();
    this.costs = new CostAnalyticsStore(this.db, this.workspaceId);
  }

  withWorkspace(workspaceId: string): AgentStore {
    return workspaceId === this.workspaceId ? this : new AgentStore(workspaceId, this.db);
  }

  async ready(): Promise<void> {
    await this.db.$queryRaw`SELECT 1`;
  }

  costAnalytics(): CostAnalyticsStore {
    return this.costs;
  }

  private extensionDelegate(name: ExtensionDelegateName): {
    upsert(args: unknown): Promise<unknown>;
    findUnique(args: unknown): Promise<{ payload: Prisma.JsonValue } | null>;
    findMany(args: unknown): Promise<Array<{ payload: Prisma.JsonValue }>>;
    deleteMany(args: unknown): Promise<{ count: number }>;
    createMany(args: unknown): Promise<unknown>;
  } {
    return this.db[name] as never;
  }

  private async seedExtensionRecords<T extends { id: string }>(
    delegateName: ExtensionDelegateName,
    records: readonly T[],
  ): Promise<void> {
    await this.extensionDelegate(delegateName).createMany({
      data: records.map((record, sortOrder) => ({
        workspaceId: this.workspaceId,
        id: record.id,
        payload: jsonInput(record),
        sortOrder,
      })),
      skipDuplicates: true,
    });
  }

  private async saveExtensionRecord<T extends { id: string }>(
    delegateName: ExtensionDelegateName,
    record: T,
  ): Promise<T> {
    await this.extensionDelegate(delegateName).upsert({
      where: { workspaceId_id: { workspaceId: this.workspaceId, id: record.id } },
      create: {
        workspaceId: this.workspaceId,
        id: record.id,
        payload: jsonInput(record),
      },
      update: { payload: jsonInput(record) },
    });
    return record;
  }

  private async getExtensionRecord<T>(
    delegateName: ExtensionDelegateName,
    id: string,
  ): Promise<T | undefined> {
    const row = await this.extensionDelegate(delegateName).findUnique({
      where: { workspaceId_id: { workspaceId: this.workspaceId, id } },
      select: { payload: true },
    });
    return row ? decode<T>(row.payload) : undefined;
  }

  private async listExtensionRecords<T>(delegateName: ExtensionDelegateName): Promise<T[]> {
    const rows = await this.extensionDelegate(delegateName).findMany({
      where: { workspaceId: this.workspaceId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: { payload: true },
    });
    return rows.map((row) => decode<T>(row.payload));
  }

  private async deleteExtensionRecord(delegateName: ExtensionDelegateName, id: string): Promise<boolean> {
    const result = await this.extensionDelegate(delegateName).deleteMany({
      where: { workspaceId: this.workspaceId, id },
    });
    return result.count > 0;
  }

  async seedExtensionCatalog(catalog: ExtensionCatalog): Promise<void> {
    await this.seedExtensionRecords("extensionSkillRecord", catalog.skills);
    await this.seedExtensionRecords("extensionMcpServerRecord", catalog.mcpServers);
    await this.seedExtensionRecords("extensionKnowledgeSourceRecord", catalog.knowledgeSources);
    await this.seedExtensionRecords("agentSpecializationRecord", catalog.specializations);
  }

  saveSkillDefinition(skill: SkillDefinition): Promise<SkillDefinition> {
    return this.saveExtensionRecord("extensionSkillRecord", skill);
  }
  getSkillDefinition(id: string): Promise<SkillDefinition | undefined> {
    return this.getExtensionRecord("extensionSkillRecord", id);
  }
  async listSkillDefinitions(): Promise<SkillDefinition[]> {
    const bindings = new Map<string, number>();
    for (const agent of await this.list()) {
      for (const id of new Set(agent.skillIds ?? [])) bindings.set(id, (bindings.get(id) ?? 0) + 1);
    }
    return (await this.listExtensionRecords<SkillDefinition>("extensionSkillRecord"))
      .map((skill) => ({ ...skill, bindings: bindings.get(skill.id) ?? 0 }));
  }
  deleteSkillDefinition(id: string): Promise<boolean> {
    return this.deleteExtensionRecord("extensionSkillRecord", id);
  }
  saveMcpServerDefinition(server: McpServerDefinition): Promise<McpServerDefinition> {
    return this.saveExtensionRecord("extensionMcpServerRecord", server);
  }
  getMcpServerDefinition(id: string): Promise<McpServerDefinition | undefined> {
    return this.getExtensionRecord("extensionMcpServerRecord", id);
  }
  listMcpServerDefinitions(): Promise<McpServerDefinition[]> {
    return this.listExtensionRecords("extensionMcpServerRecord");
  }
  deleteMcpServerDefinition(id: string): Promise<boolean> {
    return this.deleteExtensionRecord("extensionMcpServerRecord", id);
  }
  saveKnowledgeSourceDefinition(source: KnowledgeSourceDefinition): Promise<KnowledgeSourceDefinition> {
    return this.saveExtensionRecord("extensionKnowledgeSourceRecord", source);
  }
  getKnowledgeSourceDefinition(id: string): Promise<KnowledgeSourceDefinition | undefined> {
    return this.getExtensionRecord("extensionKnowledgeSourceRecord", id);
  }
  listKnowledgeSourceDefinitions(): Promise<KnowledgeSourceDefinition[]> {
    return this.listExtensionRecords("extensionKnowledgeSourceRecord");
  }
  deleteKnowledgeSourceDefinition(id: string): Promise<boolean> {
    return this.deleteExtensionRecord("extensionKnowledgeSourceRecord", id);
  }
  saveAgentSpecialization(specialization: AgentSpecializationDefinition): Promise<AgentSpecializationDefinition> {
    return this.saveExtensionRecord("agentSpecializationRecord", specialization);
  }
  listAgentSpecializations(): Promise<AgentSpecializationDefinition[]> {
    return this.listExtensionRecords("agentSpecializationRecord");
  }

  async isExtensionResourceInUse(kind: ExtensionResourceKind, id: string): Promise<boolean> {
    const agentField = kind === "skills" ? "skillIds" : kind === "mcp-servers" ? "mcpServerIds" : "knowledgeSourceIds";
    if ((await this.list()).some((agent) => (agent[agentField] ?? []).includes(id))) return true;
    const specializationField = kind === "skills" ? "defaultSkillIds" : kind === "mcp-servers" ? "defaultMcpServerIds" : "defaultKnowledgeSourceIds";
    return (await this.listAgentSpecializations())
      .some((specialization) => specialization[specializationField].includes(id));
  }

  async save(agent: Agent): Promise<Agent> {
    await this.db.agentRecord.upsert({
      where: { workspaceId_id: { workspaceId: this.workspaceId, id: agent.id } },
      create: {
        workspaceId: this.workspaceId,
        id: agent.id,
        payload: jsonInput(agent),
        createdAt: agent.createdAt,
      },
      update: { payload: jsonInput(agent) },
    });
    const binding = await this.getModelProfileBindingForAgent(agent.id);
    if (binding) await this.saveBindingAttribution(binding, agent);
    return agent;
  }

  async get(id: string): Promise<Agent | undefined> {
    const row = await this.db.agentRecord.findUnique({
      where: { workspaceId_id: { workspaceId: this.workspaceId, id } },
      select: { payload: true },
    });
    return row ? parseCurrentAgent(row.payload) : undefined;
  }

  async list(): Promise<Agent[]> {
    const rows = await this.db.agentRecord.findMany({
      where: { workspaceId: this.workspaceId },
      orderBy: { createdAt: "desc" },
      select: { payload: true },
    });
    return rows.flatMap((row) => {
      const agent = parseCurrentAgent(row.payload);
      return agent ? [agent] : [];
    });
  }

  async listAgentsForReporting(): Promise<Array<Pick<Agent, "id" | "name" | "sandboxName" | "costKeyAlias" | "modelProfileKeyFingerprint">>> {
    return (await this.list()).map((agent) => ({
      id: agent.id,
      name: agent.name,
      sandboxName: agent.sandboxName,
      costKeyAlias: agent.costKeyAlias ?? `tali-${agent.name}`,
      modelProfileKeyFingerprint: agent.modelProfileKeyFingerprint,
    }));
  }

  async delete(id: string): Promise<void> {
    await this.db.agentRecord.deleteMany({ where: { workspaceId: this.workspaceId, id } });
  }

  async saveProviderAccount(account: ProviderAccount, credentialPayload?: string): Promise<ProviderAccount> {
    const credential = credentialPayload ?? await this.getProviderAccountCredential(account.id);
    if (!credential) throw new Error("An API credential is required for a new Provider Account.");
    await this.db.providerAccountRecord.upsert({
      where: { workspaceId_id: { workspaceId: this.workspaceId, id: account.id } },
      create: {
        workspaceId: this.workspaceId,
        id: account.id,
        payload: jsonInput(account),
        credentialPayload: credential,
        createdAt: account.createdAt,
      },
      update: {
        payload: jsonInput(account),
        credentialPayload: credential,
      },
    });
    return account;
  }

  async getProviderAccount(id: string): Promise<ProviderAccount | undefined> {
    const row = await this.db.providerAccountRecord.findUnique({
      where: { workspaceId_id: { workspaceId: this.workspaceId, id } },
      select: { payload: true },
    });
    return row ? parseProviderAccount(row.payload) : undefined;
  }
  async listProviderAccounts(): Promise<ProviderAccount[]> {
    const rows = await this.db.providerAccountRecord.findMany({
      where: { workspaceId: this.workspaceId },
      orderBy: { createdAt: "desc" },
      select: { payload: true },
    });
    return rows.map((row) => parseProviderAccount(row.payload));
  }
  async getProviderAccountCredential(id: string): Promise<string | undefined> {
    const row = await this.db.providerAccountRecord.findUnique({
      where: { workspaceId_id: { workspaceId: this.workspaceId, id } },
      select: { credentialPayload: true },
    });
    return row?.credentialPayload;
  }

  async saveModelDeployment(deployment: ModelDeployment): Promise<ModelDeployment> {
    await this.db.modelDeploymentRecord.upsert({
      where: { workspaceId_id: { workspaceId: this.workspaceId, id: deployment.id } },
      create: {
        workspaceId: this.workspaceId,
        id: deployment.id,
        providerAccountId: deployment.providerAccountId,
        payload: jsonInput(deployment),
        createdAt: deployment.createdAt,
      },
      update: { payload: jsonInput(deployment) },
    });
    const account = await this.getProviderAccount(deployment.providerAccountId);
    await this.costs.saveModelEndpointMapping({
      id: `deployment:${deployment.id}:${deployment.createdAt}`,
      modelEndpointId: deployment.id,
      modelEndpointName: deployment.displayName,
      liteLLMModelName: deployment.litellmModelName,
      liteLLMModelGroup: deployment.litellmModelName,
      liteLLMModelId: deployment.modelId,
      provider: deployment.providerName,
      providerAccountId: deployment.providerAccountId,
      providerAccountName: account?.name ?? deployment.providerAccountId,
      validFrom: deployment.createdAt,
      createdAt: deployment.createdAt,
      updatedAt: deployment.updatedAt,
    });
    return deployment;
  }

  async setDefaultModelDeployment(id: string): Promise<ModelDeployment | undefined> {
    const selected = await this.getModelDeployment(id);
    if (!selected) return undefined;
    await this.db.$transaction(async (transaction) => {
      const scoped = new AgentStore(this.workspaceId, transaction as unknown as PrismaClient);
      for (const deployment of await scoped.listModelDeployments()) {
        const isDefault = deployment.id === id;
        if (deployment.isDefault !== isDefault) {
          await scoped.saveModelDeployment({
            ...deployment,
            isDefault,
            updatedAt: new Date().toISOString(),
          });
        }
      }
    });
    return this.getModelDeployment(id);
  }

  async getModelDeployment(id: string): Promise<ModelDeployment | undefined> {
    const row = await this.db.modelDeploymentRecord.findUnique({
      where: { workspaceId_id: { workspaceId: this.workspaceId, id } },
      select: { payload: true },
    });
    return row ? parseModelDeployment(row.payload) : undefined;
  }
  async listModelDeployments(providerAccountId?: string): Promise<ModelDeployment[]> {
    return this.listModelDeploymentsForReporting(providerAccountId);
  }
  async listModelDeploymentsForReporting(providerAccountId?: string): Promise<ModelDeployment[]> {
    const rows = await this.db.modelDeploymentRecord.findMany({
      where: {
        workspaceId: this.workspaceId,
        ...(providerAccountId ? { providerAccountId } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: { payload: true },
    });
    return rows.map((row) => parseModelDeployment(row.payload));
  }
  async deleteModelDeployment(id: string): Promise<boolean> {
    const result = await this.db.modelDeploymentRecord.deleteMany({
      where: { workspaceId: this.workspaceId, id },
    });
    return result.count > 0;
  }
  async listAgentIdsUsingModelDeployments(ids: readonly string[]): Promise<string[]> {
    if (!ids.length) return [];
    const idSet = new Set(ids);
    return (await this.list()).flatMap((agent) =>
      agent.modelDeploymentId && idSet.has(agent.modelDeploymentId) ? [agent.id] : [],
    );
  }
  async deleteProviderAccount(id: string): Promise<boolean> {
    const result = await this.db.providerAccountRecord.deleteMany({
      where: { workspaceId: this.workspaceId, id },
    });
    return result.count > 0;
  }

  async saveAgentCostKey(agentId: string, tokenId: string): Promise<void> {
    await this.db.agentCostKey.upsert({
      where: { workspaceId_agentId: { workspaceId: this.workspaceId, agentId } },
      create: { workspaceId: this.workspaceId, agentId, tokenId },
      update: { tokenId },
    });
  }
  async getAgentCostKey(agentId: string): Promise<string | undefined> {
    const row = await this.db.agentCostKey.findUnique({
      where: { workspaceId_agentId: { workspaceId: this.workspaceId, agentId } },
      select: { tokenId: true },
    });
    return row?.tokenId;
  }
  async deleteAgentCostKey(agentId: string): Promise<void> {
    await this.db.agentCostKey.deleteMany({ where: { workspaceId: this.workspaceId, agentId } });
  }

  async saveInferenceGateway(gateway: InferenceGateway): Promise<InferenceGateway> {
    await this.db.inferenceGatewayRecord.upsert({
      where: { workspaceId_id: { workspaceId: this.workspaceId, id: gateway.id } },
      create: {
        workspaceId: this.workspaceId,
        id: gateway.id,
        payload: jsonInput(gateway),
        createdAt: gateway.createdAt,
      },
      update: { payload: jsonInput(gateway) },
    });
    return gateway;
  }
  async getInferenceGateway(id: string): Promise<InferenceGateway | undefined> {
    const row = await this.db.inferenceGatewayRecord.findUnique({
      where: { workspaceId_id: { workspaceId: this.workspaceId, id } },
      select: { payload: true },
    });
    return row ? decode<InferenceGateway>(row.payload) : undefined;
  }
  async listInferenceGateways(): Promise<InferenceGateway[]> {
    const rows = await this.db.inferenceGatewayRecord.findMany({
      where: { workspaceId: this.workspaceId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { payload: true },
    });
    return rows.map((row) => decode<InferenceGateway>(row.payload));
  }

  async saveModelProfile(profile: ModelProfile): Promise<ModelProfile> {
    await this.db.modelProfileRecord.upsert({
      where: { workspaceId_id: { workspaceId: this.workspaceId, id: profile.id } },
      create: {
        workspaceId: this.workspaceId,
        id: profile.id,
        payload: jsonInput(profile),
        createdAt: profile.createdAt,
      },
      update: { payload: jsonInput(profile) },
    });
    const gateway = await this.getInferenceGateway(profile.gatewayId);
    await this.costs.saveModelEndpointMapping({
      id: `model-profile:${profile.id}:${profile.createdAt}`,
      modelEndpointId: `model-profile:${profile.id}`,
      modelEndpointName: profile.name,
      liteLLMModelName: profile.publicModelAlias,
      liteLLMModelGroup: profile.publicModelAlias,
      provider: "LiteLLM",
      providerAccountId: profile.gatewayId,
      providerAccountName: gateway?.name ?? profile.gatewayId,
      validFrom: profile.createdAt,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    });
    return profile;
  }
  async getModelProfile(id: string): Promise<ModelProfile | undefined> {
    const row = await this.db.modelProfileRecord.findUnique({
      where: { workspaceId_id: { workspaceId: this.workspaceId, id } },
      select: { payload: true },
    });
    return row ? decode<ModelProfile>(row.payload) : undefined;
  }
  async listModelProfiles(): Promise<ModelProfile[]> {
    const rows = await this.db.modelProfileRecord.findMany({
      where: { workspaceId: this.workspaceId },
      orderBy: { createdAt: "desc" },
      select: { payload: true },
    });
    return rows.map((row) => decode<ModelProfile>(row.payload));
  }
  async deleteModelProfile(id: string): Promise<boolean> {
    const result = await this.db.modelProfileRecord.deleteMany({
      where: { workspaceId: this.workspaceId, id },
    });
    return result.count > 0;
  }

  async saveModelProfileBinding(binding: ModelProfileBinding): Promise<ModelProfileBinding> {
    const previous = await this.getModelProfileBindingForAgent(binding.agentId);
    if (previous && previous.id !== binding.id && !previous.revokedAt) {
      const previousAgent = await this.get(previous.agentId);
      await this.saveBindingAttribution(
        { ...previous, revokedAt: binding.createdAt },
        previousAgent,
      );
    }
    await this.db.modelProfileBindingRecord.upsert({
      where: { workspaceId_id: { workspaceId: this.workspaceId, id: binding.id } },
      create: {
        workspaceId: this.workspaceId,
        id: binding.id,
        modelProfileId: binding.modelProfileId,
        agentId: binding.agentId,
        payload: jsonInput(binding),
        createdAt: binding.createdAt,
      },
      update: { payload: jsonInput(binding) },
    });
    await this.saveBindingAttribution(binding, await this.get(binding.agentId));
    return binding;
  }
  private async saveBindingAttribution(binding: ModelProfileBinding, agent?: Agent): Promise<void> {
    const profile = await this.getModelProfile(binding.modelProfileId);
    await this.costs.saveAttribution({
      id: `binding:${binding.id}`,
      workspaceId: this.workspaceId,
      environmentId: process.env.TALI_ENVIRONMENT_ID ?? "production",
      instanceId: binding.agentId,
      instanceName: agent?.name ?? binding.agentId,
      liteLLMVirtualKeyId: costKeyIdentifier(binding.liteLLMTokenId),
      hashedToken: binding.keyFingerprint,
      virtualKeyAlias: binding.keyAlias,
      liteLLMUserId: binding.agentId,
      ...(binding.liteLLMTeamId ? { liteLLMTeamId: binding.liteLLMTeamId } : {}),
      ...(profile?.gatewayId ? { providerAccountId: profile.gatewayId } : {}),
      validFrom: binding.createdAt,
      ...(binding.revokedAt ? { validTo: binding.revokedAt } : {}),
      createdAt: binding.createdAt,
      updatedAt: binding.revokedAt ?? agent?.updatedAt ?? binding.createdAt,
    });
  }
  async getModelProfileBindingForAgent(agentId: string): Promise<ModelProfileBinding | undefined> {
    const row = await this.db.modelProfileBindingRecord.findFirst({
      where: { workspaceId: this.workspaceId, agentId },
      orderBy: { createdAt: "desc" },
      select: { payload: true },
    });
    return row ? decode<ModelProfileBinding>(row.payload) : undefined;
  }
  async listModelProfileBindings(modelProfileId: string): Promise<ModelProfileBinding[]> {
    const rows = await this.db.modelProfileBindingRecord.findMany({
      where: { workspaceId: this.workspaceId, modelProfileId },
      orderBy: { createdAt: "desc" },
      select: { payload: true },
    });
    return rows.map((row) => decode<ModelProfileBinding>(row.payload));
  }
  async appendModelProfileAudit(event: ModelProfileAuditEvent): Promise<ModelProfileAuditEvent> {
    await this.db.modelProfileAuditRecord.create({
      data: {
        workspaceId: this.workspaceId,
        eventId: event.eventId,
        modelProfileId: event.modelProfileId,
        payload: jsonInput(event),
        createdAt: event.timestamp,
      },
    });
    return event;
  }
  async listModelProfileAudit(modelProfileId: string): Promise<ModelProfileAuditEvent[]> {
    const rows = await this.db.modelProfileAuditRecord.findMany({
      where: { workspaceId: this.workspaceId, modelProfileId },
      orderBy: { createdAt: "desc" },
      select: { payload: true },
    });
    return rows.map((row) => decode<ModelProfileAuditEvent>(row.payload));
  }

  async saveSandboxPolicy(policy: SandboxPolicy): Promise<SandboxPolicy> {
    const createdAt = policy.createdAt ?? new Date().toISOString();
    await this.db.sandboxPolicyRecord.upsert({
      where: { workspaceId_id: { workspaceId: this.workspaceId, id: policy.id } },
      create: {
        workspaceId: this.workspaceId,
        id: policy.id,
        payload: jsonInput(policy),
        createdAt,
      },
      update: { payload: jsonInput(policy) },
    });
    return policy;
  }
  async getSandboxPolicy(id: string): Promise<SandboxPolicy | undefined> {
    const row = await this.db.sandboxPolicyRecord.findUnique({
      where: { workspaceId_id: { workspaceId: this.workspaceId, id } },
      select: { payload: true },
    });
    return row ? decode<SandboxPolicy>(row.payload) : undefined;
  }
  async listSandboxPolicies(): Promise<SandboxPolicy[]> {
    const rows = await this.db.sandboxPolicyRecord.findMany({
      where: { workspaceId: this.workspaceId },
      orderBy: { createdAt: "desc" },
      select: { payload: true },
    });
    return rows.map((row) => decode<SandboxPolicy>(row.payload));
  }
  async deleteSandboxPolicy(id: string): Promise<void> {
    await this.db.sandboxPolicyRecord.deleteMany({ where: { workspaceId: this.workspaceId, id } });
  }
  async isSandboxPolicyInUse(id: string): Promise<boolean> {
    return (await this.list()).some((agent) => agent.policyId === id);
  }
}
