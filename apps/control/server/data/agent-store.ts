import { DatabaseSync } from "node:sqlite";
import type { Agent, ProviderConnection } from "@tasklattice/contracts";

function parseAgent(payload: string): Agent {
  const agent = JSON.parse(payload) as Agent;
  return {
    ...agent,
    agentPlatform: agent.agentPlatform ?? "openclaw",
    policyId: agent.policyId ?? "restricted",
  };
}

function parseProviderConnection(payload: string): ProviderConnection {
  const connection = JSON.parse(payload) as ProviderConnection;
  return {
    ...connection,
    inputFeePerMillionTokens: connection.inputFeePerMillionTokens ?? 0,
    outputFeePerMillionTokens: connection.outputFeePerMillionTokens ?? 0,
  };
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
      CREATE TABLE IF NOT EXISTS provider_credentials (
        provider TEXT PRIMARY KEY,
        api_key TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS provider_connections (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        api_key TEXT NOT NULL,
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

  saveProviderConnection(
    connection: ProviderConnection,
    apiKey?: string,
  ): ProviderConnection {
    const existingKey = this.getProviderConnectionCredential(connection.id);
    const credential = apiKey ?? existingKey;
    if (!credential)
      throw new Error("An API credential is required for a new provider connection.");
    this.database
      .prepare(
        `
        INSERT INTO provider_connections (id, payload, api_key, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          payload = excluded.payload,
          api_key = excluded.api_key
      `,
      )
      .run(
        connection.id,
        JSON.stringify(connection),
        credential,
        connection.createdAt,
      );
    return connection;
  }

  getProviderConnection(id: string): ProviderConnection | undefined {
    const row = this.database
      .prepare("SELECT payload FROM provider_connections WHERE id = ?")
      .get(id) as { payload: string } | undefined;
    return row ? parseProviderConnection(row.payload) : undefined;
  }

  listProviderConnections(): ProviderConnection[] {
    return (
      this.database
        .prepare(
          "SELECT payload FROM provider_connections ORDER BY created_at DESC",
        )
        .all() as Array<{ payload: string }>
    ).map((row) => parseProviderConnection(row.payload));
  }

  getProviderConnectionCredential(id: string): string | undefined {
    const row = this.database
      .prepare("SELECT api_key FROM provider_connections WHERE id = ?")
      .get(id) as { api_key: string } | undefined;
    return row?.api_key;
  }

  saveProviderCredential(provider: "deepseek", apiKey: string): void {
    this.database
      .prepare(
        `
        INSERT INTO provider_credentials (provider, api_key, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(provider) DO UPDATE SET
          api_key = excluded.api_key,
          updated_at = excluded.updated_at
      `,
      )
      .run(provider, apiKey, new Date().toISOString());
  }

  getProviderCredential(provider: "deepseek"): string | undefined {
    const row = this.database
      .prepare("SELECT api_key FROM provider_credentials WHERE provider = ?")
      .get(provider) as { api_key: string } | undefined;
    return row?.api_key;
  }
}
