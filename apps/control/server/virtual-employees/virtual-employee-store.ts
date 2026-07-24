import type {
  AccessScopeBinding,
  AccessScopeBindingInput,
  IdentityBinding,
  IdentityBindingInput,
  VirtualEmployee,
  VirtualEmployeeAuditEvent,
  VirtualEmployeeModelAccess,
} from "@tasklattice/contracts";
import { prisma } from "../db/prisma";
import type { Prisma, PrismaClient } from "../generated/prisma/client";

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

type EmployeeRow = Awaited<ReturnType<PrismaClient["virtualEmployeeRecord"]["findFirstOrThrow"]>> & {
  modelAccess?: Record<string, unknown> | null;
  identities?: Array<Record<string, unknown>>;
  accessScopes?: Array<Record<string, unknown>>;
  instances?: Array<{ instanceId: string }>;
};

function modelAccess(row: Record<string, unknown>): VirtualEmployeeModelAccess {
  return {
    id: String(row.id),
    virtualEmployeeId: String(row.virtualEmployeeId),
    provider: "litellm",
    ...(row.litellmTeamId ? { litellmTeamId: String(row.litellmTeamId) } : {}),
    ...(row.litellmKeyId ? { litellmKeyId: String(row.litellmKeyId) } : {}),
    keyAlias: String(row.keyAlias),
    ...(row.keyLastFour ? { keyLastFour: String(row.keyLastFour) } : {}),
    allowedModels: row.allowedModels as string[],
    accessGroups: row.accessGroups as string[],
    ...(row.maxBudget !== null && row.maxBudget !== undefined ? { maxBudget: Number(row.maxBudget) } : {}),
    ...(row.budgetDuration ? { budgetDuration: String(row.budgetDuration) } : {}),
    ...(row.rpmLimit !== null && row.rpmLimit !== undefined ? { rpmLimit: Number(row.rpmLimit) } : {}),
    ...(row.tpmLimit !== null && row.tpmLimit !== undefined ? { tpmLimit: Number(row.tpmLimit) } : {}),
    ...(row.maxParallelRequests !== null && row.maxParallelRequests !== undefined ? { maxParallelRequests: Number(row.maxParallelRequests) } : {}),
    keyDuration: String(row.keyDuration),
    ...(row.expiresAt instanceof Date ? { expiresAt: row.expiresAt.toISOString() } : {}),
    fallbackModels: row.fallbackModels as string[],
    ...(row.secretReference ? { secretReference: String(row.secretReference) } : {}),
    syncStatus: row.syncStatus as VirtualEmployeeModelAccess["syncStatus"],
    ...(row.lastSyncedAt instanceof Date ? { lastSyncedAt: row.lastSyncedAt.toISOString() } : {}),
    ...(row.lastSyncError ? { lastSyncError: String(row.lastSyncError) } : {}),
  };
}

function identity(row: Record<string, unknown>): IdentityBinding {
  return {
    id: String(row.id),
    virtualEmployeeId: String(row.virtualEmployeeId),
    identityType: row.identityType as IdentityBinding["identityType"],
    provider: String(row.provider),
    externalReference: String(row.externalReference),
    displayName: String(row.displayName),
    ...(row.system ? { system: String(row.system) } : {}),
    metadata: row.metadata as Record<string, unknown>,
    status: row.status as IdentityBinding["status"],
    updatedAt: (row.updatedAt as Date).toISOString(),
  };
}

function scope(row: Record<string, unknown>): AccessScopeBinding {
  return {
    id: String(row.id),
    virtualEmployeeId: String(row.virtualEmployeeId),
    resourceType: String(row.resourceType),
    resourceId: String(row.resourceId),
    actions: row.actions as string[],
    conditions: row.conditions as Record<string, unknown>,
    enforcementProvider: row.enforcementProvider as AccessScopeBinding["enforcementProvider"],
    approvalStatus: row.approvalStatus as AccessScopeBinding["approvalStatus"],
    updatedAt: (row.updatedAt as Date).toISOString(),
  };
}

function employee(row: EmployeeRow): VirtualEmployee {
  return {
    id: row.id,
    projectId: row.workspaceId,
    name: row.name,
    displayName: row.displayName,
    ...(row.description ? { description: row.description } : {}),
    ...(row.businessRole ? { businessRole: row.businessRole } : {}),
    ...(row.ownerTeamId ? { ownerTeamId: row.ownerTeamId } : {}),
    environment: row.environment as VirtualEmployee["environment"],
    status: row.status as VirtualEmployee["status"],
    tags: row.tags as string[],
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(row.modelAccess ? { modelAccess: modelAccess(row.modelAccess) } : {}),
    identities: (row.identities ?? []).map(identity),
    accessScopes: (row.accessScopes ?? []).map(scope),
    boundInstanceIds: (row.instances ?? []).map((binding) => binding.instanceId),
  };
}

const include = {
  modelAccess: true,
  identities: { orderBy: { createdAt: "asc" as const } },
  accessScopes: { orderBy: { createdAt: "asc" as const } },
  instances: { select: { instanceId: true } },
};

export class VirtualEmployeeStore {
  constructor(
    readonly workspaceId: string,
    private readonly db: PrismaClient = prisma(),
  ) {}

  async list(): Promise<VirtualEmployee[]> {
    const rows = await this.db.virtualEmployeeRecord.findMany({
      where: { workspaceId: this.workspaceId },
      include,
      orderBy: { updatedAt: "desc" },
    });
    return rows.map((row) => employee(row as unknown as EmployeeRow));
  }

  async get(id: string): Promise<VirtualEmployee | undefined> {
    const row = await this.db.virtualEmployeeRecord.findUnique({
      where: { workspaceId_id: { workspaceId: this.workspaceId, id } },
      include,
    });
    return row ? employee(row as unknown as EmployeeRow) : undefined;
  }

  async create(input: Omit<VirtualEmployee, "modelAccess" | "identities" | "accessScopes" | "boundInstanceIds">): Promise<VirtualEmployee> {
    await this.db.virtualEmployeeRecord.create({
      data: {
        workspaceId: this.workspaceId,
        id: input.id,
        name: input.name,
        displayName: input.displayName,
        description: input.description ?? null,
        businessRole: input.businessRole ?? null,
        ownerTeamId: input.ownerTeamId ?? null,
        environment: input.environment,
        status: input.status,
        tags: json(input.tags),
        createdBy: input.createdBy,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
      },
    });
    return (await this.get(input.id))!;
  }

  async update(id: string, data: Partial<Pick<VirtualEmployee, "name" | "displayName" | "description" | "businessRole" | "ownerTeamId" | "environment" | "status" | "tags">>): Promise<VirtualEmployee> {
    await this.db.virtualEmployeeRecord.update({
      where: { workspaceId_id: { workspaceId: this.workspaceId, id } },
      data: {
        ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)),
        ...(data.tags ? { tags: json(data.tags) } : {}),
        updatedAt: new Date(),
      },
    });
    return (await this.get(id))!;
  }

  async saveModelAccess(access: VirtualEmployeeModelAccess): Promise<void> {
    const data = {
      provider: access.provider,
      litellmTeamId: access.litellmTeamId ?? null,
      litellmKeyId: access.litellmKeyId ?? null,
      keyAlias: access.keyAlias,
      keyLastFour: access.keyLastFour ?? null,
      allowedModels: json(access.allowedModels),
      accessGroups: json(access.accessGroups),
      maxBudget: access.maxBudget ?? null,
      budgetDuration: access.budgetDuration ?? null,
      rpmLimit: access.rpmLimit ?? null,
      tpmLimit: access.tpmLimit ?? null,
      maxParallelRequests: access.maxParallelRequests ?? null,
      keyDuration: access.keyDuration,
      expiresAt: access.expiresAt ?? null,
      fallbackModels: json(access.fallbackModels),
      secretReference: access.secretReference ?? null,
      syncStatus: access.syncStatus,
      lastSyncedAt: access.lastSyncedAt ?? null,
      lastSyncError: access.lastSyncError ?? null,
    };
    await this.db.virtualEmployeeModelAccessRecord.upsert({
      where: { workspaceId_id: { workspaceId: this.workspaceId, id: access.id } },
      create: {
        workspaceId: this.workspaceId,
        id: access.id,
        virtualEmployeeId: access.virtualEmployeeId,
        ...data,
      },
      update: data,
    });
  }

  async attachIdentity(virtualEmployeeId: string, id: string, input: IdentityBindingInput): Promise<IdentityBinding> {
    const row = await this.db.identityBindingRecord.create({
      data: {
        workspaceId: this.workspaceId,
        id,
        virtualEmployeeId,
        identityType: input.identityType,
        provider: input.provider,
        externalReference: input.externalReference,
        displayName: input.displayName,
        system: input.system ?? null,
        metadata: json(input.metadata),
        status: "active",
      },
    });
    return identity(row as unknown as Record<string, unknown>);
  }

  async detachIdentity(id: string): Promise<boolean> {
    return (await this.db.identityBindingRecord.deleteMany({ where: { workspaceId: this.workspaceId, id } })).count > 0;
  }

  async attachScope(virtualEmployeeId: string, id: string, input: AccessScopeBindingInput): Promise<AccessScopeBinding> {
    const row = await this.db.accessScopeBindingRecord.create({
      data: {
        workspaceId: this.workspaceId,
        id,
        virtualEmployeeId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        actions: json(input.actions),
        conditions: json(input.conditions),
        enforcementProvider: input.enforcementProvider,
        approvalStatus: input.approvalStatus,
      },
    });
    return scope(row as unknown as Record<string, unknown>);
  }

  async updateScope(id: string, input: AccessScopeBindingInput): Promise<AccessScopeBinding> {
    const row = await this.db.accessScopeBindingRecord.update({
      where: { workspaceId_id: { workspaceId: this.workspaceId, id } },
      data: {
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        actions: json(input.actions),
        conditions: json(input.conditions),
        enforcementProvider: input.enforcementProvider,
        approvalStatus: input.approvalStatus,
      },
    });
    return scope(row as unknown as Record<string, unknown>);
  }

  async detachScope(id: string): Promise<boolean> {
    return (await this.db.accessScopeBindingRecord.deleteMany({ where: { workspaceId: this.workspaceId, id } })).count > 0;
  }

  async bindInstance(instanceId: string, virtualEmployeeId: string, boundBy: string): Promise<void> {
    await this.db.agentInstanceVirtualEmployeeBindingRecord.upsert({
      where: { workspaceId_instanceId: { workspaceId: this.workspaceId, instanceId } },
      create: { workspaceId: this.workspaceId, id: crypto.randomUUID(), instanceId, virtualEmployeeId, boundBy },
      update: { virtualEmployeeId, boundBy, boundAt: new Date() },
    });
  }

  async unbindInstance(instanceId: string): Promise<void> {
    await this.db.agentInstanceVirtualEmployeeBindingRecord.deleteMany({ where: { workspaceId: this.workspaceId, instanceId } });
  }

  async audit(event: VirtualEmployeeAuditEvent, metadata: Record<string, unknown> = {}): Promise<void> {
    await this.db.virtualEmployeeAuditRecord.create({
      data: {
        workspaceId: this.workspaceId,
        id: event.id,
        virtualEmployeeId: event.virtualEmployeeId,
        eventType: event.type,
        actor: event.actor,
        result: event.result,
        message: event.message,
        metadata: json(metadata),
        createdAt: event.createdAt,
      },
    });
  }

  async auditEvents(virtualEmployeeId: string): Promise<VirtualEmployeeAuditEvent[]> {
    const rows = await this.db.virtualEmployeeAuditRecord.findMany({
      where: { workspaceId: this.workspaceId, virtualEmployeeId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => ({
      id: row.id,
      virtualEmployeeId: row.virtualEmployeeId,
      type: row.eventType,
      actor: row.actor,
      result: row.result as VirtualEmployeeAuditEvent["result"],
      message: row.message,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async delete(id: string): Promise<void> {
    await this.db.$transaction([
      this.db.identityBindingRecord.deleteMany({ where: { workspaceId: this.workspaceId, virtualEmployeeId: id } }),
      this.db.accessScopeBindingRecord.deleteMany({ where: { workspaceId: this.workspaceId, virtualEmployeeId: id } }),
      this.db.virtualEmployeeAuditRecord.deleteMany({ where: { workspaceId: this.workspaceId, virtualEmployeeId: id } }),
      this.db.virtualEmployeeModelAccessRecord.deleteMany({ where: { workspaceId: this.workspaceId, virtualEmployeeId: id } }),
      this.db.virtualEmployeeRecord.delete({ where: { workspaceId_id: { workspaceId: this.workspaceId, id } } }),
    ]);
  }
}
