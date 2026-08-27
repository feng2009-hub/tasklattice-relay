import {
  agentConnectionSchema,
  agentGardenEntrySchema,
  type AgentConnection,
  type AgentGardenEntry,
  type AgentGardenSkill,
} from "@tali/contracts";
import { prisma } from "../db/prisma";
import type { PrismaClient } from "../generated/prisma/client";
import { createSecretStore, type SecretStore } from "../secrets/secret-store";
import { AgentGardenStore } from "../agent-garden/agent-garden-store";
import { databaseAgentCatalog } from "../agent-garden/database-agent-catalog";

export interface ProjectA2aPeer {
  approvalMode: AgentConnection["approvalMode"];
  description: string;
  id: string;
  name: string;
  protocolVersion: "1.0";
  skills: AgentGardenSkill[];
  timeoutSeconds: number;
}

interface ResolvedConnection {
  agent: AgentGardenEntry;
  connection: AgentConnection;
}

const MAX_A2A_RESPONSE_BYTES = 1024 * 1024;

async function limitedResponseText(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength)
    && declaredLength > MAX_A2A_RESPONSE_BYTES
  ) {
    throw new Error("The connected A2A Agent response exceeded the 1 MiB limit.");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_A2A_RESPONSE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new Error("The connected A2A Agent response exceeded the 1 MiB limit.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function jsonRpcError(id: unknown, code: number, message: string): unknown {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

function requestId(payload: unknown): unknown {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as { id?: unknown }).id
    : null;
}

function jsonRpcSendMessageParams(payload: unknown): unknown | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }
  const request = payload as { method?: unknown; params?: unknown };
  return request.method === "SendMessage"
    && request.params
    && typeof request.params === "object"
    && !Array.isArray(request.params)
      ? request.params
      : undefined;
}

function httpJsonSendMessageEndpoint(endpoint: string): string {
  return `${endpoint.replace(/\/$/, "")}/message:send`;
}

export class ProjectAgentRuntimeService {
  constructor(
    readonly projectId: string,
    private readonly db: PrismaClient = prisma(),
    private readonly secrets: SecretStore = createSecretStore(),
  ) {}

  async listPeers(coordinatorInstanceId: string): Promise<ProjectA2aPeer[]> {
    const connections = await this.connections(coordinatorInstanceId);
    return connections.map(({ agent, connection }) => {
      const allowed = new Set(connection.allowedSkillIds);
      return {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        protocolVersion: "1.0" as const,
        approvalMode: connection.approvalMode,
        timeoutSeconds: 120,
        skills: allowed.size
          ? agent.skills.filter((skill) => allowed.has(skill.id))
          : agent.skills,
      };
    });
  }

  async agentCard(
    coordinatorInstanceId: string,
    agentId: string,
    publicEndpoint: string,
  ): Promise<unknown> {
    const { agent, connection } = await this.connection(
      coordinatorInstanceId,
      agentId,
    );
    const allowed = new Set(connection.allowedSkillIds);
    return {
      name: agent.name,
      description: agent.description,
      version: agent.configuration.catalogVersion ?? "1.0.0",
      supportedInterfaces: [{
        url: publicEndpoint,
        protocolBinding: "JSONRPC",
        protocolVersion: "1.0",
        ...(agent.a2a?.tenant ? { tenant: agent.a2a.tenant } : {}),
      }],
      capabilities: {
        streaming: false,
        pushNotifications: false,
        extendedAgentCard: false,
      },
      defaultInputModes: agent.a2a?.defaultInputModes ?? ["text/plain"],
      defaultOutputModes: agent.a2a?.defaultOutputModes ?? ["text/plain"],
      skills: allowed.size
        ? agent.skills.filter((skill) => allowed.has(skill.id))
        : agent.skills,
    };
  }

  async sendMessage(
    coordinatorInstanceId: string,
    agentId: string,
    payload: unknown,
  ): Promise<{ body: unknown; status: number }> {
    const { agent, connection } = await this.connection(
      coordinatorInstanceId,
      agentId,
    );
    if (connection.approvalMode === "ALWAYS_ASK") {
      return {
        status: 200,
        body: jsonRpcError(
          requestId(payload),
          -32001,
          "Human approval is required for this Agent connection.",
        ),
      };
    }
    if (!agent.endpoint) {
      throw new Error("Connected A2A Agent endpoint is unavailable.");
    }
    const headers = new Headers({
      accept: "application/a2a+json, application/json",
      "content-type": "application/json",
      "a2a-version": "1.0",
    });
    if (agent.authReference) {
      const credential = await this.secrets.get(agent.authReference);
      if (agent.authType === "bearer_token") {
        headers.set("authorization", `Bearer ${credential}`);
      } else if (agent.authType === "api_key") {
        headers.set("x-api-key", credential);
      }
    }
    const httpJsonParams = agent.a2a?.protocolBinding === "HTTP+JSON"
      ? jsonRpcSendMessageParams(payload)
      : undefined;
    if (agent.a2a?.protocolBinding === "HTTP+JSON" && !httpJsonParams) {
      return {
        status: 200,
        body: jsonRpcError(
          requestId(payload),
          -32601,
          "The connected HTTP+JSON Agent supports SendMessage only.",
        ),
      };
    }
    const endpoint = httpJsonParams
      ? httpJsonSendMessageEndpoint(agent.endpoint)
      : agent.endpoint;
    if (httpJsonParams) headers.set("content-type", "application/a2a+json");
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(httpJsonParams ?? payload),
      redirect: "error",
      signal: AbortSignal.timeout(120_000),
    });
    const text = await limitedResponseText(response);
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      if (response.ok) {
        return {
          status: 502,
          body: jsonRpcError(
            requestId(payload),
            -32002,
            "The connected A2A Agent returned a non-JSON response.",
          ),
        };
      }
    }
    if (httpJsonParams) {
      return response.ok
        ? {
            status: response.status,
            body: {
              jsonrpc: "2.0",
              id: requestId(payload),
              result: body,
            },
          }
        : {
            status: response.status,
            body: jsonRpcError(
              requestId(payload),
              -32002,
              `The connected HTTP+JSON Agent returned HTTP ${response.status}.`,
            ),
          };
    }
    return { status: response.status, body };
  }

  private async connections(
    coordinatorInstanceId: string,
  ): Promise<ResolvedConnection[]> {
    await new AgentGardenStore(this.projectId, this.db).ensureAgents(
      databaseAgentCatalog,
    );
    const coordinator = await this.db.agentRecord.findFirst({
      where: {
        projectId: this.projectId,
        id: coordinatorInstanceId,
        kind: "SUPERVISOR",
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!coordinator) throw new Error("Coordinator Instance was not found.");
    const rows = await this.db.agentConnectionRecord.findMany({
      where: {
        projectId: this.projectId,
        coordinatorInstanceId,
        deletedAt: null,
        connectedAgent: { deletedAt: null },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        payload: true,
        connectedAgent: { select: { payload: true } },
      },
    });
    return rows
      .map((row) => ({
        connection: agentConnectionSchema.parse(row.payload),
        agent: agentGardenEntrySchema.parse(row.connectedAgent.payload),
      }))
      .filter(({ agent }) =>
        agent.status === "READY"
        && agent.integrationType === "a2a"
        && Boolean(agent.endpoint)
      );
  }

  private async connection(
    coordinatorInstanceId: string,
    agentId: string,
  ): Promise<ResolvedConnection> {
    const found = (await this.connections(coordinatorInstanceId)).find(
      ({ agent }) => agent.id === agentId,
    );
    if (!found) throw new Error("Connected A2A Agent was not found.");
    return found;
  }
}
