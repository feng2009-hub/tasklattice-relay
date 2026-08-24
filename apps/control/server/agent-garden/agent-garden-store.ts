import {
  agentConnectionSchema,
  agentGardenEntrySchema,
  managedA2aInstanceSchema,
  type AgentConnection,
  type AgentGardenEntry,
  type ManagedA2aInstance,
} from "@tali/contracts";
import { prisma } from "../db/prisma";
import type { Prisma, PrismaClient } from "../generated/prisma/client";

function jsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function managedInstancePayload(
  instance: ManagedA2aInstance,
): Prisma.InputJsonValue {
  const { createdBy: _createdBy, ...payload } = instance;
  return jsonInput(payload);
}

function managedInstanceCreator(user: {
  id: string;
  displayName: string;
  username: string | null;
}): NonNullable<ManagedA2aInstance["createdBy"]> {
  return {
    id: user.id,
    displayName: user.displayName,
    username: user.username ?? user.displayName,
  };
}

export class AgentGardenStore {
  constructor(
    readonly projectId = "individual",
    private readonly db: PrismaClient = prisma(),
  ) {}

  database(): PrismaClient {
    return this.db;
  }

  async saveAgent(
    agent: AgentGardenEntry,
    ownerUserId?: string,
  ): Promise<AgentGardenEntry> {
    const parsed = agentGardenEntrySchema.parse(agent);
    const timestamps = {
      createdAt: parsed.createdAt ? new Date(parsed.createdAt) : new Date(),
      updatedAt: parsed.updatedAt ? new Date(parsed.updatedAt) : new Date(),
    };
    if (!ownerUserId) {
      const updated = await this.db.agentCatalogRecord.updateMany({
        where: { projectId: this.projectId, id: parsed.id },
        data: {
          payload: jsonInput(parsed),
          updatedAt: timestamps.updatedAt,
        },
      });
      if (updated.count) return parsed;
      if (parsed.source !== "BUILT_IN") {
        throw new Error("An owner user is required when creating an Agent Garden entry.");
      }
    }
    await this.db.agentCatalogRecord.upsert({
      where: {
        projectId_id: {
          projectId: this.projectId,
          id: parsed.id,
        },
      },
      create: {
        projectId: this.projectId,
        id: parsed.id,
        payload: jsonInput(parsed),
        ...(ownerUserId ? { ownerUserId } : {}),
        ...timestamps,
      },
      update: {
        payload: jsonInput(parsed),
        updatedAt: timestamps.updatedAt,
      },
    });
    return parsed;
  }

  async ensureAgents(agents: AgentGardenEntry[]): Promise<number> {
    if (!agents.length) return 0;
    const rows = await this.db.agentCatalogRecord.findMany({
      where: {
        projectId: this.projectId,
        id: { in: agents.map((agent) => agent.id) },
      },
      select: { id: true, payload: true },
    });
    const existing = new Map(
      rows.map((row) => [
        row.id,
        catalogVersion(row.payload),
      ]),
    );
    let saved = 0;
    for (const agent of agents) {
      if (existing.get(agent.id) === agent.configuration.catalogVersion) {
        continue;
      }
      await this.saveAgent(agent);
      saved += 1;
    }
    return saved;
  }

  async getAgent(id: string): Promise<AgentGardenEntry | undefined> {
    const row = await this.db.agentCatalogRecord.findUnique({
      where: {
        projectId_id: {
          projectId: this.projectId,
          id,
        },
      },
      select: { payload: true },
    });
    return row ? agentGardenEntrySchema.parse(row.payload) : undefined;
  }

  async ownerUserId(id: string): Promise<string | undefined> {
    const row = await this.db.agentCatalogRecord.findUnique({
      where: { projectId_id: { projectId: this.projectId, id } },
      select: { ownerUserId: true },
    });
    return row?.ownerUserId ?? undefined;
  }

  async listAgents(ownerUserId?: string): Promise<AgentGardenEntry[]> {
    const rows = await this.db.agentCatalogRecord.findMany({
      where: {
        projectId: this.projectId,
        ...(ownerUserId ? { ownerUserId } : {}),
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      select: { payload: true },
    });
    return rows.map((row) => agentGardenEntrySchema.parse(row.payload));
  }

  async deleteAgent(id: string): Promise<boolean> {
    const result = await this.db.agentCatalogRecord.deleteMany({
      where: { projectId: this.projectId, id },
    });
    return result.count > 0;
  }

  async saveManagedInstance(
    instance: ManagedA2aInstance,
    ownerUserId?: string,
  ): Promise<ManagedA2aInstance> {
    const parsed = managedA2aInstanceSchema.parse(instance);
    if (!ownerUserId) {
      const updated = await this.db.managedA2aInstanceRecord.updateMany({
        where: { projectId: this.projectId, id: parsed.id },
        data: {
          payload: managedInstancePayload(parsed),
          updatedAt: new Date(parsed.updatedAt),
        },
      });
      if (!updated.count) {
        throw new Error(
          "An owner user is required when creating a managed A2A Instance.",
        );
      }
      return parsed;
    }
    await this.db.managedA2aInstanceRecord.upsert({
      where: {
        projectId_id: { projectId: this.projectId, id: parsed.id },
      },
      create: {
        projectId: this.projectId,
        id: parsed.id,
        agentId: parsed.agentId,
        ownerUserId,
        payload: managedInstancePayload(parsed),
        createdAt: new Date(parsed.createdAt),
        updatedAt: new Date(parsed.updatedAt),
      },
      update: {
        payload: managedInstancePayload(parsed),
        updatedAt: new Date(parsed.updatedAt),
      },
    });
    return parsed;
  }

  async getManagedInstanceForAgent(
    agentId: string,
  ): Promise<ManagedA2aInstance | undefined> {
    const row = await this.db.managedA2aInstanceRecord.findFirst({
      where: { projectId: this.projectId, agentId },
      orderBy: { createdAt: "asc" },
      select: {
        payload: true,
        ownerMembership: {
          select: {
            user: {
              select: { id: true, displayName: true, username: true },
            },
          },
        },
      },
    });
    return row
      ? managedA2aInstanceSchema.parse({
          ...(row.payload as object),
          createdBy: managedInstanceCreator(row.ownerMembership.user),
        })
      : undefined;
  }

  async listManagedInstances(
    ownerUserId?: string,
  ): Promise<ManagedA2aInstance[]> {
    const rows = await this.db.managedA2aInstanceRecord.findMany({
      where: {
        projectId: this.projectId,
        ...(ownerUserId ? { ownerUserId } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      select: {
        payload: true,
        ownerMembership: {
          select: {
            user: {
              select: { id: true, displayName: true, username: true },
            },
          },
        },
      },
    });
    return rows.map((row) => managedA2aInstanceSchema.parse({
      ...(row.payload as object),
      createdBy: managedInstanceCreator(row.ownerMembership.user),
    }));
  }

  async deleteManagedInstanceForAgent(agentId: string): Promise<boolean> {
    const result = await this.db.managedA2aInstanceRecord.deleteMany({
      where: { projectId: this.projectId, agentId },
    });
    return result.count > 0;
  }

  async saveConnection(
    connection: AgentConnection,
  ): Promise<AgentConnection> {
    const parsed = agentConnectionSchema.parse(connection);
    await this.db.agentConnectionRecord.create({
      data: {
        projectId: this.projectId,
        id: parsed.id,
        coordinatorInstanceId: parsed.coordinatorInstanceId,
        connectedAgentId: parsed.connectedAgentId,
        payload: jsonInput(parsed),
        createdAt: new Date(parsed.createdAt),
        updatedAt: new Date(parsed.updatedAt),
      },
    });
    return parsed;
  }

  async listConnections(ownerUserId?: string): Promise<AgentConnection[]> {
    const rows = await this.db.agentConnectionRecord.findMany({
      where: {
        projectId: this.projectId,
        ...(ownerUserId ? { coordinator: { ownerUserId } } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      select: { payload: true },
    });
    return rows.map((row) => agentConnectionSchema.parse(row.payload));
  }

  async findConnection(
    coordinatorInstanceId: string,
    connectedAgentId: string,
  ): Promise<AgentConnection | undefined> {
    const row = await this.db.agentConnectionRecord.findUnique({
      where: {
        projectId_coordinatorInstanceId_connectedAgentId: {
          projectId: this.projectId,
          coordinatorInstanceId,
          connectedAgentId,
        },
      },
      select: { payload: true },
    });
    return row ? agentConnectionSchema.parse(row.payload) : undefined;
  }

  async countConnectionsForAgent(connectedAgentId: string): Promise<number> {
    return this.db.agentConnectionRecord.count({
      where: {
        projectId: this.projectId,
        connectedAgentId,
      },
    });
  }

  async deleteConnection(id: string): Promise<boolean> {
    const result = await this.db.agentConnectionRecord.deleteMany({
      where: { projectId: this.projectId, id },
    });
    return result.count > 0;
  }
}

function catalogVersion(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }
  const configuration = (payload as Record<string, unknown>).configuration;
  if (
    !configuration
    || typeof configuration !== "object"
    || Array.isArray(configuration)
  ) {
    return undefined;
  }
  const version = (configuration as Record<string, unknown>).catalogVersion;
  return typeof version === "string" ? version : undefined;
}
