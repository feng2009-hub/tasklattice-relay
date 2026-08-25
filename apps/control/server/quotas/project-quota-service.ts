import type { ProjectQuota, UpdateProjectQuotaInput } from "@tali/contracts";
import type { PrismaClient } from "../generated/prisma/client";
import { lockDepartmentBudget } from "../departments/department-budget-lock";
import {
  LiteLLMClient,
  type LiteLLMAdminClient,
  type LiteLLMInstanceServiceAccountInput,
} from "../providers/litellm-client";
import { ProjectStore } from "../projects/project-store";
import { type BudgetDuration, nextBudgetWindow } from "./budget-window";

type LimitedResource = "instances" | "mcp" | "knowledge-base";

export class ProjectQuotaService {
  private readonly db: PrismaClient;

  constructor(
    readonly store = new ProjectStore(),
    readonly litellm: LiteLLMAdminClient = new LiteLLMClient(),
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.db = store.database();
  }

  async get(): Promise<ProjectQuota> {
    const now = this.clock();
    const quota = await this.ensureCurrentBudgetWindow(now);
    const usageWindow = quota.budgetPeriodStartedAt
      ? { requestStartTime: { gte: quota.budgetPeriodStartedAt, lt: now } }
      : {};
    const [usage, instances, mcpIntegrations, knowledgeBaseIntegrations] =
      await Promise.all([
        this.db.modelUsageFactRecord.aggregate({
          where: { projectId: this.store.projectId, ...usageWindow },
          _sum: { totalCostUsd: true, totalTokens: true },
        }),
        this.db.agentRecord.count({
          where: { projectId: this.store.projectId, deletedAt: null },
        }),
        this.db.mcpServerRecord.count({
          where: { projectId: this.store.projectId, deletedAt: null },
        }),
        this.db.knowledgeSourceRecord.count({
          where: { projectId: this.store.projectId, deletedAt: null },
        }),
      ]);
    return {
      projectId: quota.projectId,
      hardBudgetUsd:
        quota.hardBudgetUsd === null ? null : Number(quota.hardBudgetUsd),
      budgetDuration: quota.budgetDuration as ProjectQuota["budgetDuration"],
      budgetPeriodStartedAt: quota.budgetPeriodStartedAt?.toISOString() ?? null,
      budgetResetsAt: quota.budgetResetsAt?.toISOString() ?? null,
      tpmLimit: quota.tpmLimit === null ? null : Number(quota.tpmLimit),
      maxInstances: quota.maxInstances,
      maxMcpIntegrations: quota.maxMcpIntegrations,
      maxKnowledgeBaseIntegrations: quota.maxKnowledgeBaseIntegrations,
      litellmTeamId: quota.litellmTeamId,
      syncStatus: quota.syncStatus as ProjectQuota["syncStatus"],
      lastSyncedAt: quota.lastSyncedAt?.toISOString() ?? null,
      lastSyncError: quota.lastSyncError,
      revision: quota.revision,
      usage: {
        spendUsd: Number(usage._sum.totalCostUsd ?? 0),
        totalTokens: Number(usage._sum.totalTokens ?? 0),
        instances,
        mcpIntegrations,
        knowledgeBaseIntegrations,
      },
    };
  }

  async update(
    input: UpdateProjectQuotaInput,
    actor: string,
  ): Promise<ProjectQuota> {
    await this.db.$transaction(async (transaction) => {
      const project = await transaction.project.findUniqueOrThrow({
        where: { id: this.store.projectId },
        select: {
          departmentId: true,
          department: {
            select: {
              hardBudgetUsd: true,
              hardMaxInstances: true,
              hardMaxMcpIntegrations: true,
              hardMaxKnowledgeBaseIntegrations: true,
            },
          },
        },
      });
      await lockDepartmentBudget(transaction, project.departmentId);
      const current = await transaction.projectQuotaRecord.upsert({
        where: { projectId: this.store.projectId },
        create: { projectId: this.store.projectId },
        update: {},
      });
      const currentBudget =
        current.hardBudgetUsd === null ? null : Number(current.hardBudgetUsd);
      const budgetChanged =
        currentBudget !== input.hardBudgetUsd ||
        current.budgetDuration !== input.budgetDuration;
      const window =
        input.hardBudgetUsd !== null && input.budgetDuration !== null
          ? nextBudgetWindow(
              this.clock(),
              input.budgetDuration,
              budgetChanged ? null : current.budgetPeriodStartedAt,
              budgetChanged ? null : current.budgetResetsAt,
            )
          : null;

      if (project.department.hardBudgetUsd !== null) {
        if (input.hardBudgetUsd === null) {
          throw new Error(
            "A Project inside a budget-limited Department must have an explicit budget.",
          );
        }
        const siblings = await transaction.projectQuotaRecord.aggregate({
          where: {
            projectId: { not: this.store.projectId },
            project: {
              departmentId: project.departmentId,
              deletedAt: null,
            },
          },
          _sum: { hardBudgetUsd: true },
        });
        const allocatedBudgetUsd =
          Number(siblings._sum.hardBudgetUsd ?? 0) + input.hardBudgetUsd;
        const departmentBudgetUsd = Number(project.department.hardBudgetUsd);
        if (allocatedBudgetUsd > departmentBudgetUsd) {
          throw new Error(
            `Project budget would allocate $${allocatedBudgetUsd.toFixed(2)} of the Department's $${departmentBudgetUsd.toFixed(2)} limit.`,
          );
        }
      }

      const siblingCapacity = await transaction.projectQuotaRecord.aggregate({
        where: {
          projectId: { not: this.store.projectId },
          project: { departmentId: project.departmentId, deletedAt: null },
        },
        _sum: {
          maxInstances: true,
          maxMcpIntegrations: true,
          maxKnowledgeBaseIntegrations: true,
        },
      });
      const capacityChecks = [
        ["Instance", input.maxInstances, siblingCapacity._sum.maxInstances, project.department.hardMaxInstances],
        ["MCP integration", input.maxMcpIntegrations, siblingCapacity._sum.maxMcpIntegrations, project.department.hardMaxMcpIntegrations],
        ["Knowledge Base integration", input.maxKnowledgeBaseIntegrations, siblingCapacity._sum.maxKnowledgeBaseIntegrations, project.department.hardMaxKnowledgeBaseIntegrations],
      ] as const;
      for (const [label, requested, siblingAllocation, departmentHard] of capacityChecks) {
        if (departmentHard === null) continue;
        if (requested === null) {
          throw new Error(
            `A Project inside a ${label}-limited Department must have an explicit ${label} quota.`,
          );
        }
        const allocated = Number(siblingAllocation ?? 0) + requested;
        if (allocated > departmentHard) {
          throw new Error(
            `${label} quota would allocate ${allocated} of the Department's ${departmentHard} hard limit.`,
          );
        }
      }

      await transaction.projectQuotaRecord.upsert({
        where: { projectId: this.store.projectId },
        create: {
          projectId: this.store.projectId,
          ...this.databaseInput(input, window),
          updatedBy: actor,
          syncStatus: "pending",
        },
        update: {
          ...this.databaseInput(input, window),
          updatedBy: actor,
          syncStatus: "pending",
          lastSyncError: null,
          revision: { increment: 1 },
        },
      });
    });
    await this.sync().catch(() => undefined);
    return this.get();
  }

  async ensureProjectTeam(): Promise<string> {
    const project = await this.db.project.findUniqueOrThrow({
      where: { id: this.store.projectId },
    });
    const quota = await this.ensureRecord();
    let teamId = quota.litellmTeamId;
    try {
      if (!teamId) {
        const ensure = this.requireAdapter("ensureProjectTeam");
        teamId = await ensure(`tali-project-${slug(project.id)}`, {
          managed_by: "tali",
          tali_project_id: project.id,
          tali_project_name: project.name,
        });
        await this.db.projectQuotaRecord.update({
          where: { projectId: project.id },
          data: { litellmTeamId: teamId },
        });
      }
      return teamId;
    } catch (error) {
      await this.markSyncFailure(error);
      throw error;
    }
  }

  async sync(): Promise<void> {
    try {
      const quota = await this.ensureRecord();
      const teamId = await this.ensureProjectTeam();
      await this.requireAdapter("updateProjectTeam")(teamId, {
        ...(quota.hardBudgetUsd !== null
          ? { maxBudget: Number(quota.hardBudgetUsd) }
          : {}),
        ...(quota.budgetDuration
          ? { budgetDuration: quota.budgetDuration }
          : {}),
        ...(quota.tpmLimit !== null
          ? { tpmLimit: Number(quota.tpmLimit) }
          : {}),
      });
      await this.db.projectQuotaRecord.update({
        where: { projectId: this.store.projectId },
        data: {
          syncStatus: "synced",
          lastSyncedAt: new Date(),
          lastSyncError: null,
        },
      });
    } catch (error) {
      await this.markSyncFailure(error);
      throw error;
    }
  }

  async createInstanceKey(
    input: Omit<LiteLLMInstanceServiceAccountInput, "teamId">,
  ) {
    const teamId = await this.ensureProjectTeam();
    const createKey = this.requireAdapter("createInstanceServiceAccountKey");
    return {
      teamId,
      key: await createKey({ ...input, teamId }),
    };
  }

  async assertCanCreate(resource: LimitedResource): Promise<void> {
    const quota = await this.ensureRecord();
    const [limit, count, label] =
      resource === "instances"
        ? [
            quota.maxInstances,
            await this.db.agentRecord.count({
              where: { projectId: this.store.projectId, deletedAt: null },
            }),
            "Instance",
          ]
        : resource === "mcp"
          ? [
              quota.maxMcpIntegrations,
              await this.db.mcpServerRecord.count({
                where: { projectId: this.store.projectId, deletedAt: null },
              }),
              "MCP integration",
            ]
          : [
              quota.maxKnowledgeBaseIntegrations,
              await this.db.knowledgeSourceRecord.count({
                where: { projectId: this.store.projectId, deletedAt: null },
              }),
              "Knowledge Base integration",
            ];
    if (limit !== null && count >= limit) {
      throw new Error(
        `${label} quota exceeded (${count}/${limit}). Increase the Project quota before adding another.`,
      );
    }
    const project = await this.db.project.findUniqueOrThrow({
      where: { id: this.store.projectId },
      select: {
        departmentId: true,
        department: {
          select: {
            hardMaxInstances: true,
            hardMaxMcpIntegrations: true,
            hardMaxKnowledgeBaseIntegrations: true,
          },
        },
      },
    });
    const [departmentLimit, departmentCount] = resource === "instances"
      ? [
          project.department.hardMaxInstances,
          await this.db.agentRecord.count({
            where: { deletedAt: null, project: { departmentId: project.departmentId, deletedAt: null } },
          }),
        ]
      : resource === "mcp"
        ? [
            project.department.hardMaxMcpIntegrations,
            await this.db.mcpServerRecord.count({
              where: { deletedAt: null, project: { departmentId: project.departmentId, deletedAt: null } },
            }),
          ]
        : [
            project.department.hardMaxKnowledgeBaseIntegrations,
            await this.db.knowledgeSourceRecord.count({
              where: { deletedAt: null, project: { departmentId: project.departmentId, deletedAt: null } },
            }),
          ];
    if (departmentLimit !== null && departmentCount >= departmentLimit) {
      throw new Error(
        `${label} Department hard quota exceeded (${departmentCount}/${departmentLimit}). A Department Administrator must raise the hard quota before another resource can be added.`,
      );
    }
  }

  private ensureRecord() {
    return this.db.projectQuotaRecord.upsert({
      where: { projectId: this.store.projectId },
      create: { projectId: this.store.projectId },
      update: {},
    });
  }

  private databaseInput(
    input: UpdateProjectQuotaInput,
    window: { startedAt: Date; resetsAt: Date } | null,
  ) {
    return {
      hardBudgetUsd: input.hardBudgetUsd,
      budgetDuration: input.budgetDuration,
      budgetPeriodStartedAt: window?.startedAt ?? null,
      budgetResetsAt: window?.resetsAt ?? null,
      tpmLimit: input.tpmLimit === null ? null : BigInt(input.tpmLimit),
      maxInstances: input.maxInstances,
      maxMcpIntegrations: input.maxMcpIntegrations,
      maxKnowledgeBaseIntegrations: input.maxKnowledgeBaseIntegrations,
    };
  }

  private async ensureCurrentBudgetWindow(now: Date) {
    const quota = await this.ensureRecord();
    if (quota.hardBudgetUsd === null || quota.budgetDuration === null)
      return quota;
    const window = nextBudgetWindow(
      now,
      quota.budgetDuration as BudgetDuration,
      quota.budgetPeriodStartedAt,
      quota.budgetResetsAt,
    );
    if (
      quota.budgetPeriodStartedAt?.getTime() === window.startedAt.getTime() &&
      quota.budgetResetsAt?.getTime() === window.resetsAt.getTime()
    )
      return quota;
    return this.db.projectQuotaRecord.update({
      where: { projectId: this.store.projectId },
      data: {
        budgetPeriodStartedAt: window.startedAt,
        budgetResetsAt: window.resetsAt,
      },
    });
  }

  private async markSyncFailure(error: unknown): Promise<void> {
    await this.db.projectQuotaRecord
      .update({
        where: { projectId: this.store.projectId },
        data: {
          syncStatus: "failed",
          lastSyncError: safeError(error),
        },
      })
      .catch(() => undefined);
  }

  private requireAdapter<K extends keyof LiteLLMAdminClient>(
    name: K,
  ): NonNullable<LiteLLMAdminClient[K]> {
    const method = this.litellm[name];
    if (typeof method !== "function")
      throw new Error(`LiteLLM adapter does not support ${String(name)}.`);
    return method.bind(this.litellm) as NonNullable<LiteLLMAdminClient[K]>;
  }
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "project"
  );
}

function safeError(error: unknown): string {
  return (
    error instanceof Error ? error.message : "LiteLLM synchronization failed."
  )
    .replace(/\bsk-[A-Za-z0-9._-]{8,}\b/g, "[REDACTED]")
    .slice(0, 1_000);
}
