import {
  type DepartmentSettingsView,
  type UpdateDepartmentSettingsInput,
  updateDepartmentSettingsSchema,
} from "@tali/contracts";
import type { PlatformPrincipal } from "../auth/auth";
import { prisma } from "../db/prisma";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { nextBudgetWindow } from "../quotas/budget-window";
import { lockDepartmentBudget } from "./department-budget-lock";
import { requireDepartmentAdministrator } from "./department-access";

type QuotaResource = "instances" | "mcpIntegrations" | "knowledgeBaseIntegrations";

const resourceDefinition = {
  instances: {
    departmentHard: "hardMaxInstances",
    projectLimit: "maxInstances",
    countRelation: "agents",
    label: "Instance",
  },
  mcpIntegrations: {
    departmentHard: "hardMaxMcpIntegrations",
    projectLimit: "maxMcpIntegrations",
    countRelation: "mcpServers",
    label: "MCP integration",
  },
  knowledgeBaseIntegrations: {
    departmentHard: "hardMaxKnowledgeBaseIntegrations",
    projectLimit: "maxKnowledgeBaseIntegrations",
    countRelation: "knowledgeSources",
    label: "Knowledge Base integration",
  },
} as const;

export class DepartmentSettingsService {
  constructor(private readonly db: PrismaClient = prisma()) {}

  async get(
    auth: PlatformPrincipal,
    departmentId: string,
  ): Promise<DepartmentSettingsView> {
    await requireDepartmentAdministrator(auth, departmentId, this.db, {
      capability: "CAP_DEPARTMENT_VIEW",
    });
    const [department, quotas, actualInstances, actualMcp, actualKnowledge] =
      await Promise.all([
        this.db.department.findUnique({
          where: { id: departmentId },
          select: departmentSettingsSelect,
        }),
        this.db.projectQuotaRecord.findMany({
          where: { project: { departmentId, deletedAt: null } },
          select: {
            hardBudgetUsd: true,
            maxInstances: true,
            maxMcpIntegrations: true,
            maxKnowledgeBaseIntegrations: true,
          },
        }),
        this.db.agentRecord.count({
          where: { deletedAt: null, project: { departmentId, deletedAt: null } },
        }),
        this.db.mcpServerRecord.count({
          where: { deletedAt: null, project: { departmentId, deletedAt: null } },
        }),
        this.db.knowledgeSourceRecord.count({
          where: { deletedAt: null, project: { departmentId, deletedAt: null } },
        }),
      ]);
    if (!department) throw new Error("Department not found.");
    return settingsView(department, quotas, {
      instances: actualInstances,
      mcpIntegrations: actualMcp,
      knowledgeBaseIntegrations: actualKnowledge,
    });
  }

  async update(
    auth: PlatformPrincipal,
    departmentId: string,
    draft: UpdateDepartmentSettingsInput,
  ): Promise<DepartmentSettingsView> {
    await requireDepartmentAdministrator(auth, departmentId, this.db, {
      capability: "CAP_DEPARTMENT_SETTINGS_UPDATE",
    });
    await requireDepartmentAdministrator(auth, departmentId, this.db, {
      capability: "CAP_DEPARTMENT_QUOTA_UPDATE",
    });
    const input = updateDepartmentSettingsSchema.parse(draft);
    await this.db.$transaction(async (transaction) => {
      await lockDepartmentBudget(transaction, departmentId);
      const projects = await transaction.project.findMany({
        where: { departmentId, deletedAt: null },
        select: {
          id: true,
          quota: {
            select: {
              hardBudgetUsd: true,
              maxInstances: true,
              maxMcpIntegrations: true,
              maxKnowledgeBaseIntegrations: true,
            },
          },
          _count: {
            select: {
              agents: true,
              mcpServers: true,
              knowledgeSources: true,
            },
          },
        },
      });

      if (input.quota.hardBudgetUsd !== null) {
        const budgetWindow = nextBudgetWindow(new Date(), "30d", null, null);
        for (const project of projects) {
          if (project.quota?.hardBudgetUsd === null || !project.quota) {
            await transaction.projectQuotaRecord.upsert({
              where: { projectId: project.id },
              create: {
                projectId: project.id,
                hardBudgetUsd: 0,
                budgetDuration: "30d",
                budgetPeriodStartedAt: budgetWindow.startedAt,
                budgetResetsAt: budgetWindow.resetsAt,
              },
              update: {
                hardBudgetUsd: 0,
                ...(project.quota?.hardBudgetUsd === null
                  ? {
                      budgetDuration: "30d",
                      budgetPeriodStartedAt: budgetWindow.startedAt,
                      budgetResetsAt: budgetWindow.resetsAt,
                    }
                  : {}),
              },
            });
          }
        }
      }

      for (const resource of Object.keys(resourceDefinition) as QuotaResource[]) {
        await this.boundExistingProjects(
          transaction,
          projects,
          resource,
          input.quota[resourceDefinition[resource].departmentHard],
        );
      }

      const quotas = await transaction.projectQuotaRecord.findMany({
        where: { project: { departmentId, deletedAt: null } },
        select: {
          hardBudgetUsd: true,
          maxInstances: true,
          maxMcpIntegrations: true,
          maxKnowledgeBaseIntegrations: true,
        },
      });
      assertAllocatedWithinHardQuota(
        "Project budget",
        sumNullable(quotas.map((quota) => quota.hardBudgetUsd)),
        input.quota.hardBudgetUsd,
      );
      assertAllocatedWithinHardQuota(
        "Instance",
        sumNullable(quotas.map((quota) => quota.maxInstances)),
        input.quota.hardMaxInstances,
      );
      assertAllocatedWithinHardQuota(
        "MCP integration",
        sumNullable(quotas.map((quota) => quota.maxMcpIntegrations)),
        input.quota.hardMaxMcpIntegrations,
      );
      assertAllocatedWithinHardQuota(
        "Knowledge Base integration",
        sumNullable(quotas.map((quota) => quota.maxKnowledgeBaseIntegrations)),
        input.quota.hardMaxKnowledgeBaseIntegrations,
      );

      await transaction.department.update({
        where: { id: departmentId },
        data: {
          defaultChatModel: input.models.defaultChatModel,
          defaultEmbeddingModel: input.models.defaultEmbeddingModel,
          defaultRoutingMode: input.routing.mode,
          defaultFallbackModel: input.routing.fallbackModel,
          softBudgetUsd: input.quota.softBudgetUsd,
          hardBudgetUsd: input.quota.hardBudgetUsd,
          softMaxInstances: input.quota.softMaxInstances,
          hardMaxInstances: input.quota.hardMaxInstances,
          softMaxMcpIntegrations: input.quota.softMaxMcpIntegrations,
          hardMaxMcpIntegrations: input.quota.hardMaxMcpIntegrations,
          softMaxKnowledgeBaseIntegrations:
            input.quota.softMaxKnowledgeBaseIntegrations,
          hardMaxKnowledgeBaseIntegrations:
            input.quota.hardMaxKnowledgeBaseIntegrations,
          defaultProjectHardBudgetUsd: input.projectDefaults.hardBudgetUsd,
          defaultProjectBudgetDuration: input.projectDefaults.budgetDuration,
          defaultProjectTpmLimit: input.projectDefaults.tpmLimit === null
            ? null
            : BigInt(input.projectDefaults.tpmLimit),
          defaultProjectMaxInstances: input.projectDefaults.maxInstances,
          defaultProjectMaxMcpIntegrations:
            input.projectDefaults.maxMcpIntegrations,
          defaultProjectMaxKnowledgeBaseIntegrations:
            input.projectDefaults.maxKnowledgeBaseIntegrations,
          settingsRevision: { increment: 1 },
        },
      });
    });
    return this.get(auth, departmentId);
  }

  private async boundExistingProjects(
    transaction: Prisma.TransactionClient,
    projects: Array<{
      id: string;
      quota: {
        maxInstances: number | null;
        maxMcpIntegrations: number | null;
        maxKnowledgeBaseIntegrations: number | null;
      } | null;
      _count: { agents: number; mcpServers: number; knowledgeSources: number };
    }>,
    resource: QuotaResource,
    hardLimit: number | null,
  ) {
    if (hardLimit === null) return;
    const definition = resourceDefinition[resource];
    const actualTotal = projects.reduce(
      (total, project) => total + project._count[definition.countRelation],
      0,
    );
    if (actualTotal > hardLimit) {
      throw new Error(
        `${definition.label} hard quota cannot be lower than the ${actualTotal} resources already running in this Department.`,
      );
    }
    for (const project of projects) {
      if (project.quota?.[definition.projectLimit] !== null && project.quota) continue;
      const existing = project._count[definition.countRelation];
      await transaction.projectQuotaRecord.upsert({
        where: { projectId: project.id },
        create: { projectId: project.id, [definition.projectLimit]: existing },
        update: { [definition.projectLimit]: existing },
      });
    }
  }
}

const departmentSettingsSelect = {
  id: true,
  defaultChatModel: true,
  defaultEmbeddingModel: true,
  defaultRoutingMode: true,
  defaultFallbackModel: true,
  softBudgetUsd: true,
  hardBudgetUsd: true,
  softMaxInstances: true,
  hardMaxInstances: true,
  softMaxMcpIntegrations: true,
  hardMaxMcpIntegrations: true,
  softMaxKnowledgeBaseIntegrations: true,
  hardMaxKnowledgeBaseIntegrations: true,
  defaultProjectHardBudgetUsd: true,
  defaultProjectBudgetDuration: true,
  defaultProjectTpmLimit: true,
  defaultProjectMaxInstances: true,
  defaultProjectMaxMcpIntegrations: true,
  defaultProjectMaxKnowledgeBaseIntegrations: true,
  settingsRevision: true,
  _count: { select: { projects: { where: { deletedAt: null } } } },
} as const;

type DepartmentSettingsRow = Prisma.DepartmentGetPayload<{
  select: typeof departmentSettingsSelect;
}>;

function settingsView(
  department: DepartmentSettingsRow,
  quotas: Array<{
    hardBudgetUsd: { toString(): string } | null;
    maxInstances: number | null;
    maxMcpIntegrations: number | null;
    maxKnowledgeBaseIntegrations: number | null;
  }>,
  actual: Record<QuotaResource, number>,
): DepartmentSettingsView {
  return {
    departmentId: department.id,
    revision: department.settingsRevision,
    models: {
      defaultChatModel: department.defaultChatModel,
      defaultEmbeddingModel: department.defaultEmbeddingModel,
    },
    routing: {
      mode: department.defaultRoutingMode as DepartmentSettingsView["routing"]["mode"],
      fallbackModel: department.defaultFallbackModel,
    },
    quota: {
      softBudgetUsd: decimal(department.softBudgetUsd),
      hardBudgetUsd: decimal(department.hardBudgetUsd),
      softMaxInstances: department.softMaxInstances,
      hardMaxInstances: department.hardMaxInstances,
      softMaxMcpIntegrations: department.softMaxMcpIntegrations,
      hardMaxMcpIntegrations: department.hardMaxMcpIntegrations,
      softMaxKnowledgeBaseIntegrations:
        department.softMaxKnowledgeBaseIntegrations,
      hardMaxKnowledgeBaseIntegrations:
        department.hardMaxKnowledgeBaseIntegrations,
    },
    projectDefaults: {
      hardBudgetUsd: decimal(department.defaultProjectHardBudgetUsd),
      budgetDuration: department.defaultProjectBudgetDuration as DepartmentSettingsView["projectDefaults"]["budgetDuration"],
      tpmLimit: department.defaultProjectTpmLimit === null
        ? null
        : Number(department.defaultProjectTpmLimit),
      maxInstances: department.defaultProjectMaxInstances,
      maxMcpIntegrations: department.defaultProjectMaxMcpIntegrations,
      maxKnowledgeBaseIntegrations:
        department.defaultProjectMaxKnowledgeBaseIntegrations,
    },
    usage: {
      allocatedBudgetUsd: sumNullable(quotas.map((quota) => quota.hardBudgetUsd)),
      allocatedInstances: sumNullable(quotas.map((quota) => quota.maxInstances)),
      allocatedMcpIntegrations: sumNullable(
        quotas.map((quota) => quota.maxMcpIntegrations),
      ),
      allocatedKnowledgeBaseIntegrations: sumNullable(
        quotas.map((quota) => quota.maxKnowledgeBaseIntegrations),
      ),
      actualInstances: actual.instances,
      actualMcpIntegrations: actual.mcpIntegrations,
      actualKnowledgeBaseIntegrations: actual.knowledgeBaseIntegrations,
      projectCount: department._count.projects,
      unboundedProjectCounts: {
        budget: quotas.filter((quota) => quota.hardBudgetUsd === null).length,
        instances: quotas.filter((quota) => quota.maxInstances === null).length,
        mcpIntegrations: quotas.filter(
          (quota) => quota.maxMcpIntegrations === null,
        ).length,
        knowledgeBaseIntegrations: quotas.filter(
          (quota) => quota.maxKnowledgeBaseIntegrations === null,
        ).length,
      },
    },
  };
}

function decimal(value: { toString(): string } | null): number | null {
  return value === null ? null : Number(value);
}

function sumNullable(values: Array<number | bigint | { toString(): string } | null>): number {
  return values.reduce<number>((total, value) => total + Number(value ?? 0), 0);
}

function assertAllocatedWithinHardQuota(
  label: string,
  allocated: number,
  hard: number | null,
) {
  if (hard !== null && allocated > hard) {
    throw new Error(
      `${label} hard quota cannot be lower than ${allocated} already allocated across Projects.`,
    );
  }
}
