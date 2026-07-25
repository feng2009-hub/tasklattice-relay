import { randomUUID } from "node:crypto";
import type {
  AccessScopeBindingInput,
  CreateVirtualEmployeeInput,
  IdentityBindingInput,
  UpdateVirtualEmployeeInput,
  VirtualEmployee,
  VirtualEmployeeAuditEvent,
  VirtualEmployeeModelAccess,
  VirtualEmployeeSpend,
} from "@tasklattice/contracts";
import type {
  LiteLLMAdminClient,
  LiteLLMSpendLog,
} from "../providers/litellm-client";
import { LiteLLMClient } from "../providers/litellm-client";
import { createSecretStore, type SecretStore } from "./secret-store";
import { VirtualEmployeeStore } from "./virtual-employee-store";
import { ProjectQuotaService } from "../quotas/project-quota-service";
import { ProjectStore } from "../projects/project-store";

type ModelAccessInput = NonNullable<CreateVirtualEmployeeInput["modelAccess"]>;

export class VirtualEmployeeService {
  constructor(
    readonly store: VirtualEmployeeStore,
    private readonly litellm: LiteLLMAdminClient = new LiteLLMClient(),
    private readonly secrets: SecretStore = createSecretStore(),
  ) {}

  async list(): Promise<VirtualEmployee[]> {
    return (await this.store.list()).map(redactSecretReference);
  }

  async get(id: string): Promise<VirtualEmployee> {
    return redactSecretReference(await this.getStored(id));
  }

  private async getStored(id: string): Promise<VirtualEmployee> {
    const value = await this.store.get(id);
    if (!value) throw new Error("Virtual Employee not found.");
    return value;
  }

  async create(input: CreateVirtualEmployeeInput, actor: string): Promise<VirtualEmployee> {
    if ((await this.store.list()).some((employee) => employee.name === input.name)) {
      throw new Error(`Virtual Employee "${input.name}" already exists.`);
    }
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.store.create({
      id,
      projectId: this.store.projectId,
      name: input.name,
      displayName: input.displayName,
      ...(input.description ? { description: input.description } : {}),
      ...(input.businessRole ? { businessRole: input.businessRole } : {}),
      ...(input.ownerTeamId ? { ownerTeamId: input.ownerTeamId } : {}),
      environment: input.environment,
      status: "draft",
      tags: input.tags,
      createdBy: actor,
      createdAt: now,
      updatedAt: now,
    });
    if (input.modelAccess) {
      await this.store.saveModelAccess(this.desiredModelAccess(id, input.name, input.modelAccess));
    }
    for (const identity of input.identities) await this.store.attachIdentity(id, randomUUID(), identity);
    for (const scope of input.accessScopes) await this.store.attachScope(id, randomUUID(), scope);
    await this.audit(id, "virtual_employee.created", actor, "success", "Virtual Employee created as Draft.");
    if (!input.activate) return this.get(id);
    try {
      return await this.provision(id, actor);
    } catch {
      return this.get(id);
    }
  }

  async update(id: string, input: UpdateVirtualEmployeeInput, actor: string): Promise<VirtualEmployee> {
    const current = await this.getStored(id);
    const { modelAccess: _modelAccess, ...baseInput } = input;
    await this.store.update(id, withoutUndefined({
      ...baseInput,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.businessRole !== undefined ? { businessRole: input.businessRole } : {}),
      ...(input.ownerTeamId !== undefined ? { ownerTeamId: input.ownerTeamId } : {}),
    }));
    if (input.modelAccess) {
      const desired = this.desiredModelAccess(id, input.name ?? current.name, input.modelAccess, current.modelAccess);
      await this.store.saveModelAccess(desired);
      if (current.status === "active") await this.sync(id, actor, true);
    }
    await this.audit(id, "virtual_employee.updated", actor, "success", "Virtual Employee configuration updated.");
    return this.get(id);
  }

  async provision(id: string, actor: string): Promise<VirtualEmployee> {
    const employee = await this.getStored(id);
    if (!employee.modelAccess?.allowedModels.length) {
      throw new Error("Virtual Employee must have Model Access before activation.");
    }
    if (
      employee.status === "active" &&
      employee.modelAccess.syncStatus === "synced" &&
      !employee.modelAccess.litellmKeyId &&
      !employee.modelAccess.secretReference
    ) return employee;
    await this.store.update(id, { status: "provisioning" });
    const { lastSyncError: _lastSyncError, ...currentAccess } = employee.modelAccess;
    const desired = { ...currentAccess, syncStatus: "pending" as const };
    await this.store.saveModelAccess(desired);
    try {
      const teamId = await this.projectQuota().ensureProjectTeam();
      await this.removeLegacyCredential(desired);
      await this.store.saveModelAccess({
        ...withoutCredential(desired),
        litellmTeamId: teamId,
        syncStatus: "synced",
        lastSyncedAt: new Date().toISOString(),
      });
      await this.store.update(id, { status: "active" });
      await this.audit(id, "project_team.mapped", actor, "success", "Virtual Employee mapped to the Project LiteLLM Team. Runtime credentials are issued independently per Instance.");
      return this.get(id);
    } catch (error) {
      const message = safeError(error);
      await this.store.saveModelAccess({ ...desired, syncStatus: "failed", lastSyncError: message });
      await this.store.update(id, { status: "error" });
      await this.audit(id, "virtual_employee.provision_failed", actor, "failed", message);
      throw new Error(`Virtual Employee saved, but model access could not be provisioned. ${message}`);
    }
  }

  async suspend(id: string, actor: string): Promise<VirtualEmployee> {
    await this.getStored(id);
    await this.store.update(id, { status: "suspended" });
    await this.audit(id, "virtual_employee.suspended", actor, "success", "Model access disabled for this Virtual Employee.");
    return this.get(id);
  }

  async activate(id: string, actor: string): Promise<VirtualEmployee> {
    const employee = await this.getStored(id);
    if (!employee.modelAccess) throw new Error("Virtual Employee must have Model Access before activation.");
    return this.provision(id, actor);
  }

  async rotate(id: string, actor: string): Promise<VirtualEmployee> {
    await this.get(id);
    await this.audit(id, "credential.rotation_skipped", actor, "success", "Virtual Employee has no shared credential. Instance Service Account Keys rotate independently.");
    return this.get(id);
  }

  async sync(id: string, actor: string, _apply = false): Promise<VirtualEmployee> {
    const employee = await this.getStored(id);
    const access = employee.modelAccess;
    if (!access) throw new Error("Configure Model Access before synchronizing.");
    const teamId = await this.projectQuota().ensureProjectTeam();
    await this.removeLegacyCredential(access);
    const { lastSyncError: _lastSyncError, ...accessWithoutError } = access;
    await this.store.saveModelAccess({
      ...withoutCredential(accessWithoutError),
      litellmTeamId: teamId,
      syncStatus: "synced",
      lastSyncedAt: new Date().toISOString(),
    });
    await this.audit(id, "configuration.synchronized", actor, "success", "Virtual Employee is mapped to the Project Team; Instance keys inherit the Project quota.");
    return this.get(id);
  }

  async reconcileAll(actor = "virtual-employee-reconciler"): Promise<void> {
    const employees = await this.store.list();
    await Promise.allSettled(
      employees
        .filter((employee) => employee.modelAccess)
        .map(async (employee) => {
          try {
            await this.sync(employee.id, actor);
          } catch (error) {
            const message = safeError(error);
            if (employee.modelAccess) {
              await this.store.saveModelAccess({
                ...employee.modelAccess,
                syncStatus: "failed",
                lastSyncError: message,
                lastSyncedAt: new Date().toISOString(),
              });
            }
            await this.audit(employee.id, "configuration.sync_failed", actor, "failed", message);
          }
        }),
    );
  }

  async attachIdentity(id: string, input: IdentityBindingInput, actor: string): Promise<VirtualEmployee> {
    await this.get(id);
    await this.store.attachIdentity(id, randomUUID(), input);
    await this.audit(id, "identity.attached", actor, "success", `${input.displayName} attached.`);
    return this.get(id);
  }

  async detachIdentity(id: string, bindingId: string, actor: string): Promise<VirtualEmployee> {
    if (!await this.store.detachIdentity(bindingId)) throw new Error("Identity Binding not found.");
    await this.audit(id, "identity.detached", actor, "success", "Identity Binding detached.");
    return this.get(id);
  }

  async attachScope(id: string, input: AccessScopeBindingInput, actor: string): Promise<VirtualEmployee> {
    await this.get(id);
    await this.store.attachScope(id, randomUUID(), input);
    await this.audit(id, "access_scope.attached", actor, "success", `${input.resourceType} access scope attached.`);
    return this.get(id);
  }

  async updateScope(id: string, scopeId: string, input: AccessScopeBindingInput, actor: string): Promise<VirtualEmployee> {
    await this.store.updateScope(scopeId, input);
    await this.audit(id, "access_scope.updated", actor, "success", `${input.resourceType} access scope updated.`);
    return this.get(id);
  }

  async detachScope(id: string, scopeId: string, actor: string): Promise<VirtualEmployee> {
    if (!await this.store.detachScope(scopeId)) throw new Error("Access Scope Binding not found.");
    await this.audit(id, "access_scope.detached", actor, "success", "Access Scope Binding detached.");
    return this.get(id);
  }

  async bindInstance(id: string, instanceId: string, actor: string): Promise<void> {
    const employee = await this.get(id);
    if (employee.status !== "active") throw new Error("Only an Active Virtual Employee can be bound to an Instance.");
    await this.store.bindInstance(instanceId, id, actor);
    await this.audit(id, "instance.bound", actor, "success", `Instance ${instanceId} bound.`);
  }

  async unbindInstance(instanceId: string, actor: string): Promise<void> {
    const employee = (await this.store.list()).find((item) => item.boundInstanceIds.includes(instanceId));
    await this.store.unbindInstance(instanceId);
    if (employee) await this.audit(employee.id, "instance.unbound", actor, "success", `Instance ${instanceId} unbound.`);
  }

  async runtimeConfiguration(id: string): Promise<{ endpoint: string; model: string }> {
    const employee = await this.getStored(id);
    if (employee.status !== "active") throw new Error("Virtual Employee is not Active.");
    const model = employee.modelAccess?.allowedModels[0];
    if (!model) throw new Error("Virtual Employee Model Access is incomplete.");
    return { endpoint: `${this.litellm.baseUrl}/v1`, model };
  }

  async spend(id: string): Promise<VirtualEmployeeSpend> {
    const employee = await this.getStored(id);
    const end = new Date();
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 30);
    const logs = (await this.litellm.listSpendLogs(start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)))
      .filter((log) => log.metadata?.tali_virtual_employee_id === employee.id);
    return summarizeSpend(logs, employee.modelAccess?.maxBudget);
  }

  auditEvents(id: string): Promise<VirtualEmployeeAuditEvent[]> {
    return this.store.auditEvents(id);
  }

  async delete(id: string, actor: string): Promise<void> {
    const employee = await this.getStored(id);
    if (employee.boundInstanceIds.length) throw new Error("Virtual Employee is in use by an Agent Instance.");
    if (employee.modelAccess) await this.removeLegacyCredential(employee.modelAccess);
    await this.audit(id, "virtual_employee.deleted", actor, "success", "Virtual Employee deleted.");
    await this.store.delete(id);
  }

  private desiredModelAccess(id: string, name: string, input: ModelAccessInput, current?: VirtualEmployeeModelAccess): VirtualEmployeeModelAccess {
    return {
      id: current?.id ?? randomUUID(),
      virtualEmployeeId: id,
      provider: "litellm",
      ...(input.litellmTeamId ? { litellmTeamId: input.litellmTeamId } : current?.litellmTeamId ? { litellmTeamId: current.litellmTeamId } : {}),
      ...(current?.litellmKeyId ? { litellmKeyId: current.litellmKeyId } : {}),
      keyAlias: `tali-${slug(this.store.projectId)}-${slug(name)}`,
      ...(current?.keyLastFour ? { keyLastFour: current.keyLastFour } : {}),
      allowedModels: input.allowedModels,
      accessGroups: input.accessGroups,
      ...(input.maxBudget !== undefined ? { maxBudget: input.maxBudget } : {}),
      budgetDuration: input.budgetDuration,
      ...(input.rpmLimit !== undefined ? { rpmLimit: input.rpmLimit } : {}),
      ...(input.tpmLimit !== undefined ? { tpmLimit: input.tpmLimit } : {}),
      ...(input.maxParallelRequests !== undefined ? { maxParallelRequests: input.maxParallelRequests } : {}),
      keyDuration: input.keyDuration,
      ...(current?.expiresAt ? { expiresAt: current.expiresAt } : {}),
      fallbackModels: input.fallbackModels,
      ...(current?.secretReference ? { secretReference: current.secretReference } : {}),
      syncStatus: current?.syncStatus ?? "pending",
      ...(current?.lastSyncedAt ? { lastSyncedAt: current.lastSyncedAt } : {}),
      ...(current?.lastSyncError ? { lastSyncError: current.lastSyncError } : {}),
    };
  }

  private projectQuota(): ProjectQuotaService {
    return new ProjectQuotaService(
      new ProjectStore(this.store.projectId, this.store.database()),
      this.litellm,
    );
  }

  private async removeLegacyCredential(access: VirtualEmployeeModelAccess): Promise<void> {
    if (access.litellmKeyId) await this.litellm.revokeKey(access.litellmKeyId).catch(() => undefined);
    if (access.secretReference) await this.secrets.delete(access.secretReference).catch(() => undefined);
  }

  private audit(id: string, type: string, actor: string, result: VirtualEmployeeAuditEvent["result"], message: string): Promise<void> {
    return this.store.audit({ id: randomUUID(), virtualEmployeeId: id, type, actor, result, message, createdAt: new Date().toISOString() });
  }
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "resource";
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : "Provisioning failed.")
    .replace(/\bsk-[A-Za-z0-9._-]{8,}\b/g, "[REDACTED]");
}

function withoutCredential(access: VirtualEmployeeModelAccess): VirtualEmployeeModelAccess {
  const {
    litellmKeyId: _litellmKeyId,
    keyLastFour: _keyLastFour,
    secretReference: _secretReference,
    expiresAt: _expiresAt,
    ...safe
  } = access;
  return safe;
}

function redactSecretReference(employee: VirtualEmployee): VirtualEmployee {
  if (!employee.modelAccess?.secretReference) return employee;
  const { secretReference: _secretReference, ...modelAccess } = employee.modelAccess;
  return { ...employee, modelAccess };
}

function summarizeSpend(logs: LiteLLMSpendLog[], maxBudget?: number): VirtualEmployeeSpend {
  const models = new Map<string, { spend: number; requests: number; tokens: number }>();
  const days = new Map<string, number>();
  let totalSpend = 0;
  let tokens = 0;
  for (const log of logs) {
    const spend = log.spend ?? log.litellm_calculated_cost ?? log.provider_reported_cost ?? 0;
    const count = log.total_tokens ?? (log.prompt_tokens ?? 0) + (log.completion_tokens ?? 0);
    const model = log.resolved_model ?? log.model ?? log.requested_model ?? "Unknown";
    const value = models.get(model) ?? { spend: 0, requests: 0, tokens: 0 };
    value.spend += spend;
    value.requests += 1;
    value.tokens += count;
    models.set(model, value);
    const timestamp = log.startTime ?? log.start_time ?? log.request_start_time;
    if (timestamp) days.set(timestamp.slice(0, 10), (days.get(timestamp.slice(0, 10)) ?? 0) + spend);
    totalSpend += spend;
    tokens += count;
  }
  return {
    totalSpend,
    requests: logs.length,
    tokens,
    ...(maxBudget && maxBudget > 0 ? { budgetUtilization: Math.min(100, totalSpend / maxBudget * 100) } : {}),
    byModel: [...models].map(([model, value]) => ({ model, ...value })).sort((a, b) => b.spend - a.spend),
    daily: [...days].map(([date, spend]) => ({ date, spend })).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

function withoutUndefined<T extends object>(value: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as { [K in keyof T]?: Exclude<T[K], undefined> };
}
