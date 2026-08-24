import { departmentNameSchema } from "@tali/contracts";
import type { PlatformPrincipal } from "../auth/auth";
import { RoleCatalogService } from "../authorization/role-catalog";
import { prisma } from "../db/prisma";
import type { PrismaClient } from "../generated/prisma/client";
import { nextBudgetWindow } from "../quotas/budget-window";
import { lockDepartmentBudget } from "./department-budget-lock";
import {
  requireActiveDepartmentUser,
  requireDepartmentAdministrator,
} from "./department-access";

export type DepartmentRole = "administrator" | "member";

export interface DepartmentSummaryView {
  id: string;
  name: string;
  description?: string;
  hardBudgetUsd: number | null;
  allocatedBudgetUsd: number;
  memberCount: number;
  projectCount: number;
  role: "administrator";
  status: "active" | "suspended";
}

export interface DepartmentDetailView extends DepartmentSummaryView {
  createdAt: string;
  members: Array<{
    id: string;
    displayName: string;
    email: string;
    role: DepartmentRole;
    status: "active" | "suspended";
  }>;
  projects: Array<{
    id: string;
    name: string;
    hardBudgetUsd: number | null;
    memberCount: number;
  }>;
}

export interface UpdateDepartmentInput {
  description: string | null;
  hardBudgetUsd: number | null;
  name: string;
}

function summary(row: {
  _count: { members: number; projects: number };
  description: string | null;
  hardBudgetUsd: { toString(): string } | null;
  id: string;
  name: string;
  projects: Array<{
    quota: { hardBudgetUsd: { toString(): string } | null } | null;
  }>;
  status: string;
}): DepartmentSummaryView {
  return {
    id: row.id,
    name: row.name,
    ...(row.description ? { description: row.description } : {}),
    hardBudgetUsd:
      row.hardBudgetUsd === null ? null : Number(row.hardBudgetUsd),
    allocatedBudgetUsd: row.projects.reduce(
      (total, project) => total + Number(project.quota?.hardBudgetUsd ?? 0),
      0,
    ),
    memberCount: row._count.members,
    projectCount: row._count.projects,
    role: "administrator",
    status: row.status as DepartmentSummaryView["status"],
  };
}

const summaryInclude = {
  _count: {
    select: {
      members: { where: { status: "active" } },
      projects: { where: { deletedAt: null } },
    },
  },
  projects: {
    where: { deletedAt: null },
    select: {
      quota: { select: { hardBudgetUsd: true } },
    },
  },
} as const;

export class DepartmentService {
  constructor(private readonly db: PrismaClient = prisma()) {}

  async list(auth: PlatformPrincipal): Promise<DepartmentSummaryView[]> {
    const userId = await requireActiveDepartmentUser(auth, this.db);
    if (!await new RoleCatalogService(this.db).hasCapability(
      "ROLE_DEPARTMENT_ADMIN",
      "CAP_DEPARTMENT_VIEW",
    )) {
      throw new Error("Department Administrator cannot view Departments.");
    }
    const externalAdministratorGrants = await this.db.externalRoleGrant.findMany({
      where: {
        userId,
        binding: {
          enabled: true,
          scope: "DEPARTMENT",
          roleId: "ROLE_DEPARTMENT_ADMIN",
        },
      },
      select: { binding: { select: { departmentId: true } } },
    });
    const externalDepartmentIds = externalAdministratorGrants.flatMap(
      ({ binding }) => binding.departmentId ? [binding.departmentId] : [],
    );
    const memberships = await this.db.departmentMember.findMany({
      where: {
        userId,
        status: "active",
        OR: [
          { manualAccess: true, role: "administrator" },
          {
            externalAccessActive: true,
            departmentId: { in: externalDepartmentIds },
          },
        ],
      },
      select: { departmentId: true },
    });
    const departments = await this.db.department.findMany({
      where: {
        id: { in: memberships.map(({ departmentId }) => departmentId) },
      },
      include: summaryInclude,
      orderBy: [{ status: "asc" }, { name: "asc" }],
    });
    return departments.map(summary);
  }

  async get(
    auth: PlatformPrincipal,
    departmentId: string,
  ): Promise<DepartmentDetailView> {
    await requireDepartmentAdministrator(auth, departmentId, this.db, {
      capability: "CAP_DEPARTMENT_VIEW",
    });
    const department = await this.db.department.findUnique({
      where: { id: departmentId },
      include: {
        ...summaryInclude,
        members: {
          where: { status: "active" },
          include: { user: true },
          orderBy: { joinedAt: "asc" },
        },
        projects: {
          where: { deletedAt: null },
          include: {
            _count: { select: { humanMembers: true } },
            quota: { select: { hardBudgetUsd: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!department) throw new Error("Department not found.");
    return {
      ...summary(department),
      createdAt: department.createdAt.toISOString(),
      members: department.members.map((membership) => ({
        id: membership.userId,
        displayName: membership.user.displayName,
        email: membership.user.email,
        role: membership.role,
        status: membership.status as "active" | "suspended",
      })),
      projects: department.projects.map((project) => ({
        id: project.id,
        name: project.name,
        hardBudgetUsd:
          project.quota?.hardBudgetUsd === null ||
          project.quota?.hardBudgetUsd === undefined
            ? null
            : Number(project.quota.hardBudgetUsd),
        memberCount: project._count.humanMembers,
      })),
    };
  }

  async update(
    auth: PlatformPrincipal,
    departmentId: string,
    input: UpdateDepartmentInput,
  ): Promise<DepartmentDetailView> {
    await requireDepartmentAdministrator(auth, departmentId, this.db, {
      capability: "CAP_DEPARTMENT_SETTINGS_UPDATE",
    });
    const name = departmentNameSchema.parse(input.name);
    const description = input.description?.trim() || null;
    if (description && description.length > 500) {
      throw new Error(
        "Department description must contain at most 500 characters.",
      );
    }
    if (input.hardBudgetUsd !== null && input.hardBudgetUsd < 0) {
      throw new Error("Department budget must be zero or greater.");
    }
    await this.db.$transaction(async (transaction) => {
      await lockDepartmentBudget(transaction, departmentId);
      const department = await transaction.department.findUnique({
        where: { id: departmentId },
        select: { id: true },
      });
      if (!department) throw new Error("Department not found.");
      const duplicateName = await transaction.department.findFirst({
        where: {
          id: { not: departmentId },
          name: { equals: name, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (duplicateName) {
        throw new Error(`A Department named "${name}" already exists.`);
      }
      if (input.hardBudgetUsd !== null) {
        const window = nextBudgetWindow(new Date(), "30d", null, null);
        const projects = await transaction.project.findMany({
          where: { departmentId, deletedAt: null },
          select: { id: true },
        });
        await transaction.projectQuotaRecord.updateMany({
          where: {
            hardBudgetUsd: null,
            projectId: { in: projects.map((project) => project.id) },
          },
          data: {
            hardBudgetUsd: 0,
            budgetDuration: "30d",
            budgetPeriodStartedAt: window.startedAt,
            budgetResetsAt: window.resetsAt,
          },
        });
      }
      const allocated = await transaction.projectQuotaRecord.aggregate({
        where: {
          project: { departmentId, deletedAt: null },
        },
        _sum: { hardBudgetUsd: true },
      });
      const allocatedBudgetUsd = Number(allocated._sum.hardBudgetUsd ?? 0);
      if (
        input.hardBudgetUsd !== null &&
        input.hardBudgetUsd < allocatedBudgetUsd
      ) {
        throw new Error(
          `Department budget cannot be lower than the $${allocatedBudgetUsd.toFixed(2)} already allocated to Projects.`,
        );
      }
      await transaction.department.update({
        where: { id: departmentId },
        data: {
          name,
          description,
          hardBudgetUsd: input.hardBudgetUsd,
        },
      });
    });
    return this.get(auth, departmentId);
  }
}
