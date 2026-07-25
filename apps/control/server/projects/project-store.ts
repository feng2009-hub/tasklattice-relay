import { createHash } from "node:crypto";
import type {
  Agent,
  AgentSpecializationDefinition,
  ResourceKind,
  KnowledgeSourceDefinition,
  InferenceGateway,
  ModelProfile,
  ModelProfileAuditEvent,
  ModelProfileBinding,
  McpServerDefinition,
  McpToolDefinition,
  ModelDeployment,
  ProviderAccount,
  SandboxPolicy,
  SkillDefinition,
} from "@tasklattice/contracts";
import { prisma } from "../db/prisma";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { CostAnalyticsStore } from "../providers/cost-analytics-store";

type ResourceDelegateName =
  | "skillRecord"
  | "mcpServerRecord"
  | "knowledgeSourceRecord"
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

function mcpConnectionPayload(server: McpServerDefinition): Prisma.InputJsonValue {
  const {
    id: _id,
    litellmServerId: _litellmServerId,
    status: _status,
    tools: _tools,
    lastDiscoveryAttemptAt: _lastDiscoveryAttemptAt,
    lastDiscoveredAt: _lastDiscoveredAt,
    lastDiscoveryError: _lastDiscoveryError,
    ...connection
  } = server;
  return jsonInput(connection);
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
  return decode<ProviderAccount>(payload);
}

function parseModelDeployment(payload: Prisma.JsonValue): ModelDeployment {
  return decode<ModelDeployment>(payload);
}

export class ProjectStore {
  private readonly costs: CostAnalyticsStore;
  readonly projectId: string;
  private readonly db: PrismaClient;

  constructor(
    projectId = "individual",
    db?: PrismaClient,
  ) {
    this.projectId = projectId;
    this.db = db ?? prisma();
    this.costs = new CostAnalyticsStore(this.db, this.projectId);
  }

  costAnalytics(): CostAnalyticsStore {
    return this.costs;
  }

  database(): PrismaClient {
    return this.db;
  }

  private resourceDelegate(name: ResourceDelegateName): {
    upsert(args: unknown): Promise<unknown>;
    findUnique(args: unknown): Promise<{ payload: Prisma.JsonValue } | null>;
    findMany(args: unknown): Promise<Array<{ payload: Prisma.JsonValue }>>;
    deleteMany(args: unknown): Promise<{ count: number }>;
  } {
    return this.db[name] as never;
  }

  private async saveResourceRecord<T extends { id: string }>(
    delegateName: ResourceDelegateName,
    record: T,
  ): Promise<T> {
    await this.resourceDelegate(delegateName).upsert({
      where: { projectId_id: { projectId: this.projectId, id: record.id } },
      create: {
        projectId: this.projectId,
        id: record.id,
        payload: jsonInput(record),
      },
      update: { payload: jsonInput(record) },
    });
    return record;
  }

  private async getResourceRecord<T>(
    delegateName: ResourceDelegateName,
    id: string,
  ): Promise<T | undefined> {
    const row = await this.resourceDelegate(delegateName).findUnique({
      where: { projectId_id: { projectId: this.projectId, id } },
      select: { payload: true },
    });
    return row ? decode<T>(row.payload) : undefined;
  }

  private async listResourceRecords<T>(delegateName: ResourceDelegateName): Promise<T[]> {
    const rows = await this.resourceDelegate(delegateName).findMany({
      where: { projectId: this.projectId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: { payload: true },
    });
    return rows.map((row) => decode<T>(row.payload));
  }

  private async deleteResourceRecord(delegateName: ResourceDelegateName, id: string): Promise<boolean> {
    const result = await this.resourceDelegate(delegateName).deleteMany({
      where: { projectId: this.projectId, id },
    });
    return result.count > 0;
  }

  saveSkillDefinition(skill: SkillDefinition): Promise<SkillDefinition> {
    return this.saveResourceRecord("skillRecord", skill);
  }
  getSkillDefinition(id: string): Promise<SkillDefinition | undefined> {
    return this.getResourceRecord("skillRecord", id);
  }
  async listSkillDefinitions(): Promise<SkillDefinition[]> {
    const bindings = new Map<string, number>();
    for (const agent of await this.list()) {
      for (const id of new Set(agent.skillIds ?? [])) bindings.set(id, (bindings.get(id) ?? 0) + 1);
    }
    return (await this.listResourceRecords<SkillDefinition>("skillRecord"))
      .map((skill) => ({ ...skill, bindings: bindings.get(skill.id) ?? 0 }));
  }
  deleteSkillDefinition(id: string): Promise<boolean> {
    return this.deleteResourceRecord("skillRecord", id);
  }
  async saveMcpServerDefinition(server: McpServerDefinition): Promise<McpServerDefinition> {
    await this.db.mcpServerRecord.upsert({
      where: { projectId_id: { projectId: this.projectId, id: server.id } },
      create: {
        projectId: this.projectId,
        id: server.id,
        litellmServerId: server.litellmServerId,
        payload: mcpConnectionPayload(server),
        discoveryStatus: server.status,
        lastDiscoveryAttemptAt: server.lastDiscoveryAttemptAt,
        lastDiscoveredAt: server.lastDiscoveredAt,
        lastDiscoveryError: server.lastDiscoveryError,
      },
      update: {
        litellmServerId: server.litellmServerId,
        payload: mcpConnectionPayload(server),
        discoveryStatus: server.status,
        lastDiscoveryAttemptAt: server.lastDiscoveryAttemptAt,
        lastDiscoveredAt: server.lastDiscoveredAt,
        lastDiscoveryError: server.lastDiscoveryError,
      },
    });
    return server;
  }
  async getMcpServerDefinition(id: string): Promise<McpServerDefinition | undefined> {
    const row = await this.db.mcpServerRecord.findUnique({
      where: { projectId_id: { projectId: this.projectId, id } },
      include: { tools: { orderBy: { name: "asc" } } },
    });
    return row ? this.decodeMcpServer(row) : undefined;
  }
  async listMcpServerDefinitions(): Promise<McpServerDefinition[]> {
    const rows = await this.db.mcpServerRecord.findMany({
      where: { projectId: this.projectId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      include: { tools: { orderBy: { name: "asc" } } },
    });
    return rows.map((row) => this.decodeMcpServer(row));
  }
  async saveMcpDiscovery(
    id: string,
    result: {
      status: McpServerDefinition["status"];
      attemptedAt: string;
      discoveredAt?: string;
      error?: string;
      tools?: McpToolDefinition[];
    },
  ): Promise<McpServerDefinition> {
    const attemptedAt = new Date(result.attemptedAt);
    await this.db.$transaction(async (transaction) => {
      await transaction.mcpServerRecord.update({
        where: { projectId_id: { projectId: this.projectId, id } },
        data: {
          discoveryStatus: result.status,
          lastDiscoveryAttemptAt: attemptedAt,
          ...(result.discoveredAt ? { lastDiscoveredAt: new Date(result.discoveredAt) } : {}),
          lastDiscoveryError: result.error ?? null,
        },
      });
      if (result.tools) {
        await transaction.mcpToolRecord.deleteMany({
          where: { projectId: this.projectId, mcpServerId: id },
        });
        if (result.tools.length) {
          await transaction.mcpToolRecord.createMany({
            data: result.tools.map((tool) => ({
              projectId: this.projectId,
              mcpServerId: id,
              name: tool.name,
              title: tool.title ?? null,
              description: tool.description ?? null,
              inputSchema: jsonInput(tool.inputSchema),
              ...(tool.outputSchema ? { outputSchema: jsonInput(tool.outputSchema) } : {}),
              ...(tool.annotations ? { annotations: jsonInput(tool.annotations) } : {}),
              discoveredAt: new Date(tool.discoveredAt),
            })),
          });
        }
      }
    });
    const server = await this.getMcpServerDefinition(id);
    if (!server) throw new Error("MCP server was not found.");
    return server;
  }
  deleteMcpServerDefinition(id: string): Promise<boolean> {
    return this.deleteResourceRecord("mcpServerRecord", id);
  }
  saveKnowledgeSourceDefinition(source: KnowledgeSourceDefinition): Promise<KnowledgeSourceDefinition> {
    return this.saveResourceRecord("knowledgeSourceRecord", source);
  }
  getKnowledgeSourceDefinition(id: string): Promise<KnowledgeSourceDefinition | undefined> {
    return this.getResourceRecord("knowledgeSourceRecord", id);
  }
  listKnowledgeSourceDefinitions(): Promise<KnowledgeSourceDefinition[]> {
    return this.listResourceRecords("knowledgeSourceRecord");
  }
  deleteKnowledgeSourceDefinition(id: string): Promise<boolean> {
    return this.deleteResourceRecord("knowledgeSourceRecord", id);
  }
  listAgentSpecializations(): Promise<AgentSpecializationDefinition[]> {
    return this.listResourceRecords("agentSpecializationRecord");
  }

  private decodeMcpServer(row: {
    id: string;
    litellmServerId: string;
    payload: Prisma.JsonValue;
    discoveryStatus: McpServerDefinition["status"];
    lastDiscoveryAttemptAt: Date | null;
    lastDiscoveredAt: Date | null;
    lastDiscoveryError: string | null;
    tools: Array<{
      name: string;
      title: string | null;
      description: string | null;
      inputSchema: Prisma.JsonValue;
      outputSchema: Prisma.JsonValue | null;
      annotations: Prisma.JsonValue | null;
      discoveredAt: Date;
    }>;
  }): McpServerDefinition {
    const connection = decode<Omit<McpServerDefinition, "id" | "litellmServerId" | "status" | "tools" | "lastDiscoveryAttemptAt" | "lastDiscoveredAt" | "lastDiscoveryError">>(row.payload);
    return {
      id: row.id,
      litellmServerId: row.litellmServerId,
      ...connection,
      status: row.discoveryStatus,
      tools: row.tools.map((tool) => ({
        name: tool.name,
        ...(tool.title ? { title: tool.title } : {}),
        ...(tool.description ? { description: tool.description } : {}),
        inputSchema: decode<Record<string, unknown>>(tool.inputSchema),
        ...(tool.outputSchema ? { outputSchema: decode<Record<string, unknown>>(tool.outputSchema) } : {}),
        ...(tool.annotations ? { annotations: decode<McpToolDefinition["annotations"]>(tool.annotations) } : {}),
        discoveredAt: tool.discoveredAt.toISOString(),
      })),
      lastDiscoveryAttemptAt: row.lastDiscoveryAttemptAt?.toISOString() ?? null,
      lastDiscoveredAt: row.lastDiscoveredAt?.toISOString() ?? null,
      lastDiscoveryError: row.lastDiscoveryError,
    };
  }

  async isResourceInUse(kind: ResourceKind, id: string): Promise<boolean> {
    const agentField = kind === "skills" ? "skillIds" : kind === "mcp-servers" ? "mcpServerIds" : "knowledgeSourceIds";
    if ((await this.list()).some((agent) => (agent[agentField] ?? []).includes(id))) return true;
    const specializationField = kind === "skills" ? "defaultSkillIds" : kind === "mcp-servers" ? "defaultMcpServerIds" : "defaultKnowledgeSourceIds";
    return (await this.listAgentSpecializations())
      .some((specialization) => specialization[specializationField].includes(id));
  }

  async save(agent: Agent): Promise<Agent> {
    await this.db.agentRecord.upsert({
      where: { projectId_id: { projectId: this.projectId, id: agent.id } },
      create: {
        projectId: this.projectId,
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
      where: { projectId_id: { projectId: this.projectId, id } },
      select: { payload: true },
    });
    return row ? parseCurrentAgent(row.payload) : undefined;
  }

  async list(): Promise<Agent[]> {
    const rows = await this.db.agentRecord.findMany({
      where: { projectId: this.projectId },
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
    await this.db.agentRecord.deleteMany({ where: { projectId: this.projectId, id } });
  }

  async saveProviderAccount(account: ProviderAccount, credentialPayload?: string): Promise<ProviderAccount> {
    const credential = credentialPayload ?? await this.getProviderAccountCredential(account.id);
    if (!credential) throw new Error("An API credential is required for a new Provider Account.");
    await this.db.providerAccountRecord.upsert({
      where: { projectId_id: { projectId: this.projectId, id: account.id } },
      create: {
        projectId: this.projectId,
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
      where: { projectId_id: { projectId: this.projectId, id } },
      select: { payload: true },
    });
    return row ? parseProviderAccount(row.payload) : undefined;
  }
  async listProviderAccounts(): Promise<ProviderAccount[]> {
    const rows = await this.db.providerAccountRecord.findMany({
      where: { projectId: this.projectId },
      orderBy: { createdAt: "desc" },
      select: { payload: true },
    });
    return rows.map((row) => parseProviderAccount(row.payload));
  }
  async getProviderAccountCredential(id: string): Promise<string | undefined> {
    const row = await this.db.providerAccountRecord.findUnique({
      where: { projectId_id: { projectId: this.projectId, id } },
      select: { credentialPayload: true },
    });
    return row?.credentialPayload;
  }

  async saveModelDeployment(deployment: ModelDeployment): Promise<ModelDeployment> {
    await this.db.modelDeploymentRecord.upsert({
      where: { projectId_id: { projectId: this.projectId, id: deployment.id } },
      create: {
        projectId: this.projectId,
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
      const scoped = new ProjectStore(this.projectId, transaction as unknown as PrismaClient);
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
      where: { projectId_id: { projectId: this.projectId, id } },
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
        projectId: this.projectId,
        ...(providerAccountId ? { providerAccountId } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: { payload: true },
    });
    return rows.map((row) => parseModelDeployment(row.payload));
  }
  async deleteModelDeployment(id: string): Promise<boolean> {
    const result = await this.db.modelDeploymentRecord.deleteMany({
      where: { projectId: this.projectId, id },
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
      where: { projectId: this.projectId, id },
    });
    return result.count > 0;
  }

  async saveInferenceGateway(gateway: InferenceGateway): Promise<InferenceGateway> {
    await this.db.inferenceGatewayRecord.upsert({
      where: { projectId_id: { projectId: this.projectId, id: gateway.id } },
      create: {
        projectId: this.projectId,
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
      where: { projectId_id: { projectId: this.projectId, id } },
      select: { payload: true },
    });
    return row ? decode<InferenceGateway>(row.payload) : undefined;
  }
  async listInferenceGateways(): Promise<InferenceGateway[]> {
    const rows = await this.db.inferenceGatewayRecord.findMany({
      where: { projectId: this.projectId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { payload: true },
    });
    return rows.map((row) => decode<InferenceGateway>(row.payload));
  }

  async saveModelProfile(profile: ModelProfile): Promise<ModelProfile> {
    await this.db.modelProfileRecord.upsert({
      where: { projectId_id: { projectId: this.projectId, id: profile.id } },
      create: {
        projectId: this.projectId,
        id: profile.id,
        payload: jsonInput(profile),
        createdAt: profile.createdAt,
      },
      update: { payload: jsonInput(profile) },
    });
    await this.saveModelProfileAttribution(profile);
    return profile;
  }
  async saveDefaultModelProfile(profile: ModelProfile): Promise<ModelProfile> {
    const existing = await this.listModelProfiles();
    const now = profile.updatedAt;
    const profiles = existing.map((candidate) =>
      candidate.id === profile.id
        ? { ...profile, isDefault: true }
        : candidate.isDefault
          ? { ...candidate, isDefault: false, updatedAt: now }
          : candidate,
    );
    if (!profiles.some((candidate) => candidate.id === profile.id))
      throw new Error("Model Profile not found.");
    await this.db.$transaction(
      profiles.map((candidate) =>
        this.db.modelProfileRecord.upsert({
          where: {
            projectId_id: {
              projectId: this.projectId,
              id: candidate.id,
            },
          },
          create: {
            projectId: this.projectId,
            id: candidate.id,
            payload: jsonInput(candidate),
            createdAt: candidate.createdAt,
          },
          update: { payload: jsonInput(candidate) },
        }),
      ),
    );
    await this.saveModelProfileAttribution(profile);
    return { ...profile, isDefault: true };
  }
  private async saveModelProfileAttribution(
    profile: ModelProfile,
  ): Promise<void> {
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
  }
  async getModelProfile(id: string): Promise<ModelProfile | undefined> {
    const row = await this.db.modelProfileRecord.findUnique({
      where: { projectId_id: { projectId: this.projectId, id } },
      select: { payload: true },
    });
    return row ? decode<ModelProfile>(row.payload) : undefined;
  }
  async listModelProfiles(): Promise<ModelProfile[]> {
    const rows = await this.db.modelProfileRecord.findMany({
      where: { projectId: this.projectId },
      orderBy: { createdAt: "desc" },
      select: { payload: true },
    });
    return rows.map((row) => decode<ModelProfile>(row.payload));
  }
  async deleteModelProfile(id: string): Promise<boolean> {
    const result = await this.db.modelProfileRecord.deleteMany({
      where: { projectId: this.projectId, id },
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
      where: { projectId_id: { projectId: this.projectId, id: binding.id } },
      create: {
        projectId: this.projectId,
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
      projectId: this.projectId,
      environmentId: "production",
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
      where: { projectId: this.projectId, agentId },
      orderBy: { createdAt: "desc" },
      select: { payload: true },
    });
    return row ? decode<ModelProfileBinding>(row.payload) : undefined;
  }
  async listModelProfileBindings(modelProfileId: string): Promise<ModelProfileBinding[]> {
    const rows = await this.db.modelProfileBindingRecord.findMany({
      where: { projectId: this.projectId, modelProfileId },
      orderBy: { createdAt: "desc" },
      select: { payload: true },
    });
    return rows.map((row) => decode<ModelProfileBinding>(row.payload));
  }
  async appendModelProfileAudit(event: ModelProfileAuditEvent): Promise<ModelProfileAuditEvent> {
    await this.db.modelProfileAuditRecord.create({
      data: {
        projectId: this.projectId,
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
      where: { projectId: this.projectId, modelProfileId },
      orderBy: { createdAt: "desc" },
      select: { payload: true },
    });
    return rows.map((row) => decode<ModelProfileAuditEvent>(row.payload));
  }

  async saveSandboxPolicy(policy: SandboxPolicy): Promise<SandboxPolicy> {
    const createdAt = policy.createdAt ?? new Date().toISOString();
    await this.db.sandboxPolicyRecord.upsert({
      where: { projectId_id: { projectId: this.projectId, id: policy.id } },
      create: {
        projectId: this.projectId,
        id: policy.id,
        payload: jsonInput(policy),
        createdAt,
      },
      update: { payload: jsonInput(policy) },
    });
    return policy;
  }
  async listSandboxPolicies(): Promise<SandboxPolicy[]> {
    const rows = await this.db.sandboxPolicyRecord.findMany({
      where: { projectId: this.projectId },
      orderBy: { createdAt: "desc" },
      select: { payload: true },
    });
    return rows.map((row) => decode<SandboxPolicy>(row.payload));
  }
  async deleteSandboxPolicy(id: string): Promise<void> {
    await this.db.sandboxPolicyRecord.deleteMany({ where: { projectId: this.projectId, id } });
  }
  async isSandboxPolicyInUse(id: string): Promise<boolean> {
    return (await this.list()).some((agent) => agent.policyId === id);
  }
}
