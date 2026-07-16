import { DatabaseSync } from "node:sqlite";
import type {
  Agent,
  ModelDeployment,
  ProviderAccount,
} from "@tasklattice/contracts";

const legacyDataError =
  "Legacy Provider Connection data is unsupported. Register the Provider and its models again.";

function parseAgent(payload: string): Agent {
  const agent = JSON.parse(payload) as Agent;
  if (!agent.modelDeploymentId) throw new Error(legacyDataError);
  return {
    ...agent,
    agentPlatform: agent.agentPlatform ?? "openclaw",
    policyId: agent.policyId ?? "restricted",
  };
}

function parseProviderAccount(payload: string): ProviderAccount {
  return JSON.parse(payload) as ProviderAccount;
}

function parseModelDeployment(payload: string): ModelDeployment {
  return JSON.parse(payload) as ModelDeployment;
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
    `);
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

  delete(id: string): void {
    this.database.prepare("DELETE FROM agents WHERE id = ?").run(id);
  }

  assertNoLegacyProviderData(): void {
    const row = this.database
      .prepare("SELECT COUNT(*) AS count FROM provider_connections")
      .get() as { count: number };
    if (row.count > 0) throw new Error(legacyDataError);
  }

  saveProviderAccount(
    account: ProviderAccount,
    apiKey?: string,
  ): ProviderAccount {
    const existingKey = this.getProviderAccountCredential(account.id);
    const credential = apiKey ?? existingKey;
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
    this.assertNoLegacyProviderData();
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
    this.assertNoLegacyProviderData();
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

}
