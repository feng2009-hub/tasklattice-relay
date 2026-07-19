import { DatabaseSync } from "node:sqlite";
import type {
  Agent,
  AgentSpecializationDefinition,
  ExtensionCatalog,
  ExtensionResourceKind,
  KnowledgeSourceDefinition,
  McpServerDefinition,
  ModelDeployment,
  ProviderAccount,
  ProviderKind,
  SandboxPolicy,
  SkillDefinition,
} from "@tasklattice/contracts";

type ExtensionTable =
  | "extension_skills"
  | "extension_mcp_servers"
  | "extension_knowledge_sources"
  | "agent_specializations";

interface LegacyAgent extends Partial<Agent> {
  providerConnectionId?: string;
  provider?: string;
}

function legacyReference(kind: "account" | "model", id: string): string {
  return `legacy-${kind}:${id}`;
}

export function parseAgent(payload: string): Agent {
  const agent = JSON.parse(payload) as LegacyAgent;
  if (
    typeof agent.id !== "string" ||
    typeof agent.name !== "string" ||
    typeof agent.sandboxName !== "string" ||
    typeof agent.model !== "string" ||
    typeof agent.systemPrompt !== "string" ||
    typeof agent.createdAt !== "string" ||
    typeof agent.updatedAt !== "string" ||
    !Array.isArray(agent.logs)
  )
    throw new Error("Stored Instance data is incomplete.");

  const legacyId = agent.providerConnectionId ?? agent.id;
  const providerName = agent.providerName ?? agent.provider ?? "Legacy provider";
  return {
    ...agent,
    id: agent.id,
    name: agent.name,
    description: agent.description ?? "",
    runtime: "openshell",
    agentPlatform: agent.agentPlatform ?? "openclaw",
    policyId: agent.policyId ?? "restricted",
    systemPrompt: agent.systemPrompt,
    specializationId: agent.specializationId ?? "general-purpose",
    skillIds: agent.skillIds ?? [],
    mcpServerIds: agent.mcpServerIds ?? [],
    knowledgeSourceIds: agent.knowledgeSourceIds ?? [],
    modelDeploymentId:
      agent.modelDeploymentId ?? legacyReference("model", legacyId),
    providerAccountId:
      agent.providerAccountId ?? legacyReference("account", legacyId),
    providerName,
    model: agent.model,
    modelType: "llm",
    costKeyAlias:
      agent.costKeyAlias ?? `${agent.sandboxName}:${agent.model}`,
    sandboxName: agent.sandboxName,
    status: agent.status ?? "FAILED",
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
    logs: agent.logs,
  };
}

function parseProviderAccount(payload: string): ProviderAccount {
  const account = JSON.parse(payload) as Partial<ProviderAccount> & {
    presetId?: string;
    endpoint?: string;
  };
  const legacyKind: ProviderKind = account.presetId === "kimi-cn" || account.presetId === "kimi-global"
    ? "moonshot"
    : (account.presetId as ProviderKind | undefined) ?? "custom-openai-compatible";
  return {
    ...account,
    id: account.id ?? "",
    name: account.name ?? "Legacy Provider",
    providerKind: account.providerKind ?? legacyKind,
    presetId: (account.presetId as ProviderAccount["presetId"] | undefined) ?? legacyKind,
    endpoint: account.endpoint ?? "",
    config: account.config ?? {
      endpoint: account.endpoint ?? "",
      ...(account.presetId === "kimi-cn" ? { region: "cn" } : {}),
      ...(account.presetId === "kimi-global" ? { region: "global" } : {}),
    },
    discoveredModels: account.discoveredModels ?? [],
    credentialState: "STORED",
    status: account.status ?? "FAILED",
    checks: account.checks ?? [],
    validationMessage: account.validationMessage ?? "Legacy Provider data requires revalidation.",
    createdAt: account.createdAt ?? new Date(0).toISOString(),
    updatedAt: account.updatedAt ?? account.createdAt ?? new Date(0).toISOString(),
  };
}

function parseModelDeployment(payload: string): ModelDeployment {
  return JSON.parse(payload) as ModelDeployment;
}

function parseSandboxPolicy(payload: string): SandboxPolicy {
  return JSON.parse(payload) as SandboxPolicy;
}

export class AgentStore {
  private readonly database: DatabaseSync;

  constructor(path = process.env.DATABASE_PATH ?? ":memory:") {
    this.database = new DatabaseSync(path);
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS provider_connections (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        api_key TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS provider_accounts (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        api_key TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS model_deployments (
        id TEXT PRIMARY KEY,
        provider_account_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS agent_cost_keys (
        agent_id TEXT PRIMARY KEY,
        token_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sandbox_policies (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS extension_skills (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 1000,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS extension_mcp_servers (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 1000,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS extension_knowledge_sources (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 1000,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS agent_specializations (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 1000,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  private seedExtensionRecords<T extends { id: string }>(table: ExtensionTable, records: readonly T[]): void {
    const statement = this.database.prepare(
      `INSERT OR IGNORE INTO ${table} (id, payload, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    );
    const now = new Date().toISOString();
    records.forEach((record, index) => statement.run(record.id, JSON.stringify(record), index, now, now));
  }

  private saveExtensionRecord<T extends { id: string }>(table: ExtensionTable, record: T): T {
    const now = new Date().toISOString();
    this.database.prepare(
      `INSERT INTO ${table} (id, payload, sort_order, created_at, updated_at)
       VALUES (?, ?, 1000, ?, ?)
       ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
    ).run(record.id, JSON.stringify(record), now, now);
    return record;
  }

  private getExtensionRecord<T>(table: ExtensionTable, id: string): T | undefined {
    const row = this.database.prepare(`SELECT payload FROM ${table} WHERE id = ?`).get(id) as { payload: string } | undefined;
    return row ? JSON.parse(row.payload) as T : undefined;
  }

  private listExtensionRecords<T>(table: ExtensionTable): T[] {
    const rows = this.database.prepare(
      `SELECT payload FROM ${table} ORDER BY sort_order, created_at, id`,
    ).all() as Array<{ payload: string }>;
    return rows.map((row) => JSON.parse(row.payload) as T);
  }

  private deleteExtensionRecord(table: ExtensionTable, id: string): boolean {
    return this.database.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id).changes > 0;
  }

  seedExtensionCatalog(catalog: ExtensionCatalog): void {
    this.seedExtensionRecords("extension_skills", catalog.skills);
    this.seedExtensionRecords("extension_mcp_servers", catalog.mcpServers);
    this.seedExtensionRecords("extension_knowledge_sources", catalog.knowledgeSources);
    this.seedExtensionRecords("agent_specializations", catalog.specializations);
  }

  saveSkillDefinition(skill: SkillDefinition): SkillDefinition {
    return this.saveExtensionRecord("extension_skills", skill);
  }

  getSkillDefinition(id: string): SkillDefinition | undefined {
    return this.getExtensionRecord("extension_skills", id);
  }

  listSkillDefinitions(): SkillDefinition[] {
    const bindings = new Map<string, number>();
    for (const agent of this.list()) {
      for (const id of new Set(agent.skillIds ?? [])) bindings.set(id, (bindings.get(id) ?? 0) + 1);
    }
    return this.listExtensionRecords<SkillDefinition>("extension_skills")
      .map((skill) => ({ ...skill, bindings: bindings.get(skill.id) ?? 0 }));
  }

  deleteSkillDefinition(id: string): boolean {
    return this.deleteExtensionRecord("extension_skills", id);
  }

  saveMcpServerDefinition(server: McpServerDefinition): McpServerDefinition {
    return this.saveExtensionRecord("extension_mcp_servers", server);
  }

  getMcpServerDefinition(id: string): McpServerDefinition | undefined {
    return this.getExtensionRecord("extension_mcp_servers", id);
  }

  listMcpServerDefinitions(): McpServerDefinition[] {
    return this.listExtensionRecords("extension_mcp_servers");
  }

  deleteMcpServerDefinition(id: string): boolean {
    return this.deleteExtensionRecord("extension_mcp_servers", id);
  }

  saveKnowledgeSourceDefinition(source: KnowledgeSourceDefinition): KnowledgeSourceDefinition {
    return this.saveExtensionRecord("extension_knowledge_sources", source);
  }

  getKnowledgeSourceDefinition(id: string): KnowledgeSourceDefinition | undefined {
    return this.getExtensionRecord("extension_knowledge_sources", id);
  }

  listKnowledgeSourceDefinitions(): KnowledgeSourceDefinition[] {
    return this.listExtensionRecords("extension_knowledge_sources");
  }

  deleteKnowledgeSourceDefinition(id: string): boolean {
    return this.deleteExtensionRecord("extension_knowledge_sources", id);
  }

  saveAgentSpecialization(specialization: AgentSpecializationDefinition): AgentSpecializationDefinition {
    return this.saveExtensionRecord("agent_specializations", specialization);
  }

  listAgentSpecializations(): AgentSpecializationDefinition[] {
    return this.listExtensionRecords("agent_specializations");
  }

  isExtensionResourceInUse(kind: ExtensionResourceKind, id: string): boolean {
    const agentField = kind === "skills" ? "skillIds" : kind === "mcp-servers" ? "mcpServerIds" : "knowledgeSourceIds";
    if (this.list().some((agent) => (agent[agentField] ?? []).includes(id))) return true;
    const specializationField = kind === "skills" ? "defaultSkillIds" : kind === "mcp-servers" ? "defaultMcpServerIds" : "defaultKnowledgeSourceIds";
    return this.listAgentSpecializations().some((specialization) => specialization[specializationField].includes(id));
  }

  save(agent: Agent): Agent {
    this.database
      .prepare(
        `
        INSERT INTO agents (id, payload, created_at)
        VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET payload = excluded.payload
      `,
      )
      .run(agent.id, JSON.stringify(agent), agent.createdAt);
    return agent;
  }

  get(id: string): Agent | undefined {
    const row = this.database
      .prepare("SELECT payload FROM agents WHERE id = ?")
      .get(id) as { payload: string } | undefined;
    return row ? parseAgent(row.payload) : undefined;
  }

  list(): Agent[] {
    return (
      this.database
        .prepare("SELECT payload FROM agents ORDER BY created_at DESC")
        .all() as Array<{
        payload: string;
      }>
    ).map((row) => parseAgent(row.payload));
  }

  listAgentsForReporting(): Array<Pick<Agent, "id" | "name" | "sandboxName">> {
    const rows = this.database
      .prepare("SELECT payload FROM agents ORDER BY created_at DESC")
      .all() as Array<{ payload: string }>;
    return rows.flatMap((row) => {
      const agent = JSON.parse(row.payload) as Partial<Agent>;
      if (
        typeof agent.id !== "string" ||
        typeof agent.name !== "string" ||
        typeof agent.sandboxName !== "string"
      ) return [];
      return [{ id: agent.id, name: agent.name, sandboxName: agent.sandboxName }];
    });
  }

  delete(id: string): void {
    this.database.prepare("DELETE FROM agents WHERE id = ?").run(id);
  }

  saveProviderAccount(
    account: ProviderAccount,
    credentialPayload?: string,
  ): ProviderAccount {
    const existingKey = this.getProviderAccountCredential(account.id);
    const credential = credentialPayload ?? existingKey;
    if (!credential)
      throw new Error("An API credential is required for a new Provider Account.");
    this.database
      .prepare(
        `
        INSERT INTO provider_accounts (id, payload, api_key, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          payload = excluded.payload,
          api_key = excluded.api_key
      `,
      )
      .run(
        account.id,
        JSON.stringify(account),
        credential,
        account.createdAt,
      );
    return account;
  }

  getProviderAccount(id: string): ProviderAccount | undefined {
    const row = this.database
      .prepare("SELECT payload FROM provider_accounts WHERE id = ?")
      .get(id) as { payload: string } | undefined;
    return row ? parseProviderAccount(row.payload) : undefined;
  }

  listProviderAccounts(): ProviderAccount[] {
    return (
      this.database
        .prepare(
          "SELECT payload FROM provider_accounts ORDER BY created_at DESC",
        )
        .all() as Array<{ payload: string }>
    ).map((row) => parseProviderAccount(row.payload));
  }

  getProviderAccountCredential(id: string): string | undefined {
    const row = this.database
      .prepare("SELECT api_key FROM provider_accounts WHERE id = ?")
      .get(id) as { api_key: string } | undefined;
    return row?.api_key;
  }

  saveModelDeployment(deployment: ModelDeployment): ModelDeployment {
    this.database
      .prepare(
        `INSERT INTO model_deployments (id, provider_account_id, payload, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET payload = excluded.payload`,
      )
      .run(
        deployment.id,
        deployment.providerAccountId,
        JSON.stringify(deployment),
        deployment.createdAt,
      );
    return deployment;
  }

  getModelDeployment(id: string): ModelDeployment | undefined {
    const row = this.database
      .prepare("SELECT payload FROM model_deployments WHERE id = ?")
      .get(id) as { payload: string } | undefined;
    return row ? parseModelDeployment(row.payload) : undefined;
  }

  listModelDeployments(providerAccountId?: string): ModelDeployment[] {
    return this.listModelDeploymentsForReporting(providerAccountId);
  }

  listModelDeploymentsForReporting(providerAccountId?: string): ModelDeployment[] {
    const rows = providerAccountId
      ? this.database
          .prepare(
            "SELECT payload FROM model_deployments WHERE provider_account_id = ? ORDER BY created_at DESC",
          )
          .all(providerAccountId)
      : this.database
          .prepare("SELECT payload FROM model_deployments ORDER BY created_at DESC")
          .all();
    return (rows as Array<{ payload: string }>).map((row) =>
      parseModelDeployment(row.payload),
    );
  }

  deleteModelDeployment(id: string): boolean {
    return this.database
      .prepare("DELETE FROM model_deployments WHERE id = ?")
      .run(id).changes > 0;
  }

  listAgentIdsUsingModelDeployments(modelDeploymentIds: readonly string[]): string[] {
    if (!modelDeploymentIds.length) return [];
    const deploymentIds = new Set(modelDeploymentIds);
    const rows = this.database
      .prepare("SELECT payload FROM agents")
      .all() as Array<{ payload: string }>;
    return rows.flatMap(({ payload }) => {
      const agent = JSON.parse(payload) as Partial<Agent>;
      return typeof agent.id === "string" &&
        typeof agent.modelDeploymentId === "string" &&
        deploymentIds.has(agent.modelDeploymentId)
        ? [agent.id]
        : [];
    });
  }

  deleteProviderAccount(id: string): boolean {
    this.database
      .prepare("DELETE FROM model_deployments WHERE provider_account_id = ?")
      .run(id);
    const result = this.database
      .prepare("DELETE FROM provider_accounts WHERE id = ?")
      .run(id);
    return result.changes > 0;
  }

  saveAgentCostKey(agentId: string, tokenId: string): void {
    this.database
      .prepare(
        `INSERT INTO agent_cost_keys (agent_id, token_id, created_at)
         VALUES (?, ?, ?)
         ON CONFLICT(agent_id) DO UPDATE SET token_id = excluded.token_id`,
      )
      .run(agentId, tokenId, new Date().toISOString());
  }

  getAgentCostKey(agentId: string): string | undefined {
    const row = this.database
      .prepare("SELECT token_id FROM agent_cost_keys WHERE agent_id = ?")
      .get(agentId) as { token_id: string } | undefined;
    return row?.token_id;
  }

  deleteAgentCostKey(agentId: string): void {
    this.database.prepare("DELETE FROM agent_cost_keys WHERE agent_id = ?").run(agentId);
  }

  saveSandboxPolicy(policy: SandboxPolicy): SandboxPolicy {
    this.database
      .prepare(
        `INSERT INTO sandbox_policies (id, payload, created_at)
         VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET payload = excluded.payload`,
      )
      .run(policy.id, JSON.stringify(policy), policy.createdAt ?? new Date().toISOString());
    return policy;
  }

  getSandboxPolicy(id: string): SandboxPolicy | undefined {
    const row = this.database
      .prepare("SELECT payload FROM sandbox_policies WHERE id = ?")
      .get(id) as { payload: string } | undefined;
    return row ? parseSandboxPolicy(row.payload) : undefined;
  }

  listSandboxPolicies(): SandboxPolicy[] {
    return (
      this.database
        .prepare("SELECT payload FROM sandbox_policies ORDER BY created_at DESC")
        .all() as Array<{ payload: string }>
    ).map((row) => parseSandboxPolicy(row.payload));
  }

  deleteSandboxPolicy(id: string): void {
    this.database.prepare("DELETE FROM sandbox_policies WHERE id = ?").run(id);
  }

  isSandboxPolicyInUse(id: string): boolean {
    const rows = this.database.prepare("SELECT payload FROM agents").all() as Array<{
      payload: string;
    }>;
    return rows.some((row) => (JSON.parse(row.payload) as { policyId?: string }).policyId === id);
  }

}
