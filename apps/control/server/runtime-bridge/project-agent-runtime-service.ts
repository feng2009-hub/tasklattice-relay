import {
  agentGardenEntrySchema,
  a2aAgentInstanceSchema,
  getAgentPlatformDefinition,
  isAgentPlatformId,
  type A2aAgentInstance,
  type AgentGardenEntry,
  type AgentGardenSkill,
} from "@tali/contracts";
import { prisma } from "../db/prisma";
import type { PrismaClient } from "../generated/prisma/client";
import { createSecretStore, type SecretStore } from "../secrets/secret-store";
import { AgentGardenStore } from "../agent-garden/agent-garden-store";
import { databaseAgentCatalog } from "../agent-garden/database-agent-catalog";

export interface ProjectA2aPeer {
  description: string;
  id: string;
  name: string;
  protocolVersion: "1.0";
  skills: AgentGardenSkill[];
  timeoutSeconds: number;
}

interface ResolvedInstance {
  agent: AgentGardenEntry;
  instance: A2aAgentInstance;
}

const MAX_A2A_RESPONSE_BYTES = 1024 * 1024;

async function limitedResponseText(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength)
    && declaredLength > MAX_A2A_RESPONSE_BYTES
  ) {
    throw new Error("The callable A2A Instance response exceeded the 1 MiB limit.");
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
      throw new Error("The callable A2A Instance response exceeded the 1 MiB limit.");
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
    const instances = await this.instances(coordinatorInstanceId);
    return instances.map(({ agent, instance }) => {
      return {
        id: instance.id,
        name: instance.name,
        description: instance.description,
        protocolVersion: "1.0" as const,
        timeoutSeconds: 120,
        skills: instance.skills.length ? instance.skills : agent.skills,
      };
    });
  }

  async agentCard(
    coordinatorInstanceId: string,
    agentId: string,
    publicEndpoint: string,
  ): Promise<unknown> {
    const { agent, instance } = await this.instance(
      coordinatorInstanceId,
      agentId,
    );
    const skills = instance.skills.length ? instance.skills : agent.skills;
    return {
      name: instance.name,
      description: instance.description,
      version: agent.configuration.catalogVersion ?? "1.0.0",
      supportedInterfaces: [{
        url: publicEndpoint,
        protocolBinding: "JSONRPC",
        protocolVersion: "1.0",
        ...(instance.a2a?.tenant ? { tenant: instance.a2a.tenant } : {}),
      }],
      capabilities: {
        streaming: false,
        pushNotifications: false,
        extendedAgentCard: false,
      },
      defaultInputModes: instance.a2a?.defaultInputModes ?? ["text/plain"],
      defaultOutputModes: instance.a2a?.defaultOutputModes ?? ["text/plain"],
      skills,
    };
  }

  async sendMessage(
    coordinatorInstanceId: string,
    agentId: string,
    payload: unknown,
  ): Promise<{ body: unknown; status: number }> {
    const { agent, instance } = await this.instance(
      coordinatorInstanceId,
      agentId,
    );
    if (!instance.endpoint) {
      throw new Error("Callable A2A Instance endpoint is unavailable.");
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
    const httpJsonParams = instance.a2a?.protocolBinding === "HTTP+JSON"
      ? jsonRpcSendMessageParams(payload)
      : undefined;
    if (instance.a2a?.protocolBinding === "HTTP+JSON" && !httpJsonParams) {
      return {
        status: 200,
        body: jsonRpcError(
          requestId(payload),
          -32601,
          "The callable HTTP+JSON Instance supports SendMessage only.",
        ),
      };
    }
    const endpoint = httpJsonParams
      ? httpJsonSendMessageEndpoint(instance.endpoint)
      : instance.endpoint;
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
            "The callable A2A Instance returned a non-JSON response.",
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
              `The callable HTTP+JSON Instance returned HTTP ${response.status}.`,
            ),
          };
    }
    return { status: response.status, body };
  }

  private async instances(
    coordinatorInstanceId: string,
  ): Promise<ResolvedInstance[]> {
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
      select: { payload: true },
    });
    if (!coordinator) throw new Error("Coordinator Instance was not found.");
    const coordinatorPayload = coordinator.payload
      && typeof coordinator.payload === "object"
      && !Array.isArray(coordinator.payload)
      ? coordinator.payload as Record<string, unknown>
      : {};
    const platformId = coordinatorPayload.agentPlatform;
    if (
      typeof platformId !== "string"
      || !isAgentPlatformId(platformId)
      || !getAgentPlatformDefinition(platformId).capabilities.canDelegate
    ) {
      throw new Error("This Instance runtime cannot delegate A2A tasks.");
    }
    const rows = await this.db.agentRecord.findMany({
      where: {
        projectId: this.projectId,
        kind: "A2A",
        deletedAt: null,
        catalogAgent: { deletedAt: null },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        payload: true,
        catalogAgent: { select: { payload: true } },
      },
    });
    return rows
      .map((row) => ({
        instance: a2aAgentInstanceSchema.parse(row.payload),
        agent: agentGardenEntrySchema.parse(row.catalogAgent!.payload),
      }))
      .filter(({ agent, instance }) =>
        instance.status === "READY"
        && Boolean(instance.endpoint)
        && Boolean(instance.agentCardUrl)
        && Boolean(instance.a2a)
        && agent.status === "READY"
        && agent.integrationType === "a2a"
        && (agent.usageMode === "CALLABLE" || agent.usageMode === "HYBRID")
        && agent.usageCapabilities.acceptsDelegation
      );
  }

  private async instance(
    coordinatorInstanceId: string,
    agentId: string,
  ): Promise<ResolvedInstance> {
    const found = (await this.instances(coordinatorInstanceId)).find(
      ({ instance }) => instance.id === agentId,
    );
    if (!found) throw new Error("Callable A2A Instance was not found.");
    return found;
  }
}
