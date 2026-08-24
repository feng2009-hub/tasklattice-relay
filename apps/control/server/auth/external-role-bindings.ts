import { randomUUID } from "node:crypto";
import type {
  ExternalRoleBindingInput,
  ExternalRoleBindingView,
  ExternalRoleId,
  ReplaceExternalRoleBindingsInput,
} from "@tali/contracts";
import { prisma } from "../db/prisma";
import type {
  ExternalRoleBinding,
  Prisma,
  PrismaClient,
  ProjectRole,
} from "../generated/prisma/client";

export const corporateSsoProviderId = "corporate-sso";

const projectRoleById = {
  ROLE_PROJECT_ADMIN: "admin",
  ROLE_AUDITOR: "auditor",
  ROLE_AGENT_DEVELOPER: "developer",
  ROLE_USER: "user",
  ROLE_REVIEWER: "reviewer",
} as const satisfies Partial<Record<ExternalRoleId, ProjectRole>>;

const projectRoleActivationPriority: Partial<Record<ExternalRoleId, number>> = {
  ROLE_PROJECT_ADMIN: 0,
  ROLE_AUDITOR: 1,
  ROLE_AGENT_DEVELOPER: 2,
  ROLE_REVIEWER: 3,
  ROLE_USER: 4,
};

type Database = PrismaClient | Prisma.TransactionClient;

function sameBinding(
  stored: ExternalRoleBinding,
  input: ExternalRoleBindingInput,
): boolean {
  return stored.subjectValue === input.group
    && stored.scope === input.scope
    && stored.departmentId === input.departmentId
    && stored.projectId === input.projectId
    && stored.roleId === input.roleId
    && stored.enabled === input.enabled;
}

function bindingChanged(
  stored: ExternalRoleBinding,
  input: ExternalRoleBindingInput,
): boolean {
  return stored.subjectValue !== input.group
    || stored.scope !== input.scope
    || stored.departmentId !== input.departmentId
    || stored.projectId !== input.projectId
    || stored.roleId !== input.roleId;
}

function projectRole(roleId: string): ProjectRole {
  const role = projectRoleById[roleId as keyof typeof projectRoleById];
  if (!role) throw new Error(`Unsupported Project role binding: ${roleId}.`);
  return role;
}

async function effectiveProjectRoles(
  database: Database,
  projectId: string,
  userId: string,
): Promise<ProjectRole[]> {
  const assignments = await database.projectMemberRoleAssignment.findMany({
    where: {
      projectId,
      userId,
      OR: [
        { manualAssignment: true },
        { externalAssignmentActive: true },
      ],
    },
    select: { role: true },
    orderBy: { assignedAt: "asc" },
  });
  return Array.from(new Set(assignments.map(({ role }) => role)));
}

async function applyBinding(
  database: Database,
  binding: ExternalRoleBinding,
  userId: string,
): Promise<void> {
  if (binding.scope === "PLATFORM") {
    await database.user.update({
      where: { id: userId },
      data: { externalPlatformAdministrator: true },
    });
    return;
  }

  if (binding.scope === "DEPARTMENT") {
    if (!binding.departmentId) throw new Error("Department binding is incomplete.");
    const role = binding.roleId === "ROLE_DEPARTMENT_ADMIN"
      ? "administrator"
      : "member";
    await database.departmentMember.upsert({
      where: {
        departmentId_userId: {
          departmentId: binding.departmentId,
          userId,
        },
      },
      create: {
        departmentId: binding.departmentId,
        userId,
        role,
        manualAccess: false,
        externalAccessActive: true,
      },
      update: { externalAccessActive: true, status: "active" },
    });
    return;
  }

  if (!binding.projectId || !binding.departmentId) {
    throw new Error("Project binding is incomplete.");
  }
  const role = projectRole(binding.roleId);
  const project = await database.project.findUnique({
    where: { id: binding.projectId },
    select: { departmentId: true, deletedAt: true },
  });
  if (
    !project
    || project.deletedAt
    || project.departmentId !== binding.departmentId
  ) {
    throw new Error(
      `Project ${binding.projectId} is not active in Department ${binding.departmentId}.`,
    );
  }
  await database.projectMember.upsert({
    where: {
      projectId_userId: { projectId: binding.projectId, userId },
    },
    create: {
      projectId: binding.projectId,
      userId,
      role,
      manualAccess: false,
      externalAccessActive: true,
    },
    update: { externalAccessActive: true },
  });
  await database.projectMemberRoleAssignment.upsert({
    where: {
      projectId_userId_role: {
        projectId: binding.projectId,
        userId,
        role,
      },
    },
    create: {
      projectId: binding.projectId,
      userId,
      role,
      manualAssignment: false,
      externalAssignmentActive: true,
    },
    update: { externalAssignmentActive: true },
  });
}

async function revokeGrant(
  database: Database,
  binding: ExternalRoleBinding,
  userId: string,
): Promise<void> {
  await database.externalRoleGrant.deleteMany({
    where: { bindingId: binding.id, userId },
  });

  if (binding.scope === "PLATFORM") {
    const remaining = await database.externalRoleGrant.findFirst({
      where: {
        userId,
        binding: {
          providerId: binding.providerId,
          enabled: true,
          scope: "PLATFORM",
          roleId: "ROLE_PLATFORM_ADMIN",
        },
      },
      select: { bindingId: true },
    });
    if (!remaining) {
      await database.user.update({
        where: { id: userId },
        data: { externalPlatformAdministrator: false },
      });
    }
    return;
  }

  if (binding.scope === "DEPARTMENT" && binding.departmentId) {
    const remaining = await database.externalRoleGrant.findFirst({
      where: {
        userId,
        binding: {
          providerId: binding.providerId,
          enabled: true,
          scope: "DEPARTMENT",
          departmentId: binding.departmentId,
        },
      },
      select: { bindingId: true },
    });
    if (!remaining) {
      await database.departmentMember.updateMany({
        where: {
          departmentId: binding.departmentId,
          userId,
          manualAccess: false,
        },
        data: { externalAccessActive: false },
      });
    }
    return;
  }

  if (binding.scope !== "PROJECT" || !binding.projectId) return;
  const role = projectRole(binding.roleId);
  const remainingRoleGrant = await database.externalRoleGrant.findFirst({
    where: {
      userId,
      binding: {
        providerId: binding.providerId,
        enabled: true,
        scope: "PROJECT",
        projectId: binding.projectId,
        roleId: binding.roleId,
      },
    },
    select: { bindingId: true },
  });
  if (!remainingRoleGrant) {
    await database.projectMemberRoleAssignment.updateMany({
      where: {
        projectId: binding.projectId,
        userId,
        role,
        manualAssignment: false,
      },
      data: { externalAssignmentActive: false },
    });
  }
  const remainingProjectGrant = await database.externalRoleGrant.findFirst({
    where: {
      userId,
      binding: {
        providerId: binding.providerId,
        enabled: true,
        scope: "PROJECT",
        projectId: binding.projectId,
      },
    },
    select: { bindingId: true },
  });
  if (!remainingProjectGrant) {
    await database.projectMember.updateMany({
      where: {
        projectId: binding.projectId,
        userId,
        manualAccess: false,
      },
      data: { externalAccessActive: false },
    });
  }

  const membership = await database.projectMember.findUnique({
    where: {
      projectId_userId: { projectId: binding.projectId, userId },
    },
    select: { role: true },
  });
  if (!membership) return;
  const roles = await effectiveProjectRoles(database, binding.projectId, userId);
  if (roles.length && !roles.includes(membership.role)) {
    await database.projectMember.update({
      where: {
        projectId_userId: { projectId: binding.projectId, userId },
      },
      data: { role: roles[0]! },
    });
  }
}

export async function revokeExternalRoleBinding(
  database: Database,
  binding: ExternalRoleBinding,
): Promise<void> {
  const grants = await database.externalRoleGrant.findMany({
    where: { bindingId: binding.id },
    select: { userId: true },
  });
  for (const grant of grants) {
    await revokeGrant(database, binding, grant.userId);
  }
}

function parseJwtPayload(idToken: string): Record<string, unknown> {
  const encoded = idToken.split(".")[1];
  if (!encoded) throw new Error("The SSO ID token is malformed.");
  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    );
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("invalid payload");
    }
    return payload as Record<string, unknown>;
  } catch {
    throw new Error("The SSO ID token payload is not valid JSON.");
  }
}

export function groupsFromVerifiedIdToken(
  idToken: string,
  groupClaim: string,
): string[] {
  const value = parseJwtPayload(idToken)[groupClaim];
  if (value === undefined || value === null) return [];
  const groups = typeof value === "string" ? [value] : value;
  if (!Array.isArray(groups) || groups.some((group) => typeof group !== "string")) {
    throw new Error(`OIDC claim ${groupClaim} must be a string or string array.`);
  }
  return Array.from(new Set(groups.map((group) => group.trim()).filter(Boolean)));
}

export async function synchronizeExternalRoleBindings(
  userId: string,
  idToken: string,
  groupClaim: string,
  database: PrismaClient = prisma(),
): Promise<{ groups: string[]; matchedBindingIds: string[] }> {
  const groups = groupsFromVerifiedIdToken(idToken, groupClaim);
  return database.$transaction(async (transaction) => {
    const matched = groups.length
      ? await transaction.externalRoleBinding.findMany({
          where: {
            providerId: corporateSsoProviderId,
            subjectType: "GROUP",
            subjectValue: { in: groups },
            enabled: true,
          },
        })
      : [];
    const matchedIds = new Set(matched.map(({ id }) => id));
    const current = await transaction.externalRoleGrant.findMany({
      where: {
        userId,
        binding: { providerId: corporateSsoProviderId },
      },
      include: { binding: true },
    });

    for (const grant of current) {
      if (!matchedIds.has(grant.bindingId)) {
        await revokeGrant(transaction, grant.binding, userId);
      }
    }
    // A new membership uses the first matched Project binding as its active
    // role. Prefer Project Administrator when an IdP assigns several roles,
    // while preserving an existing user's explicit role selection on later
    // sign-ins (applyBinding only updates external-access state after create).
    const bindingsToApply = [...matched].sort((left, right) => {
      const leftPriority = left.scope === "PROJECT"
        ? (projectRoleActivationPriority[left.roleId as ExternalRoleId] ?? 100)
        : -1;
      const rightPriority = right.scope === "PROJECT"
        ? (projectRoleActivationPriority[right.roleId as ExternalRoleId] ?? 100)
        : -1;
      return leftPriority - rightPriority
        || left.subjectValue.localeCompare(right.subjectValue);
    });
    for (const binding of bindingsToApply) {
      await applyBinding(transaction, binding, userId);
      await transaction.externalRoleGrant.upsert({
        where: {
          bindingId_userId: { bindingId: binding.id, userId },
        },
        create: { bindingId: binding.id, userId },
        update: { lastSeenAt: new Date() },
      });
    }
    return { groups, matchedBindingIds: [...matchedIds] };
  });
}

async function validateTargets(
  database: Database,
  bindings: readonly ExternalRoleBindingInput[],
): Promise<void> {
  for (const binding of bindings) {
    if (binding.scope === "DEPARTMENT") {
      const department = await database.department.findUnique({
        where: { id: binding.departmentId! },
        select: { id: true },
      });
      if (!department) throw new Error(`Department ${binding.departmentId} does not exist.`);
    }
    if (binding.scope === "PROJECT") {
      const project = await database.project.findUnique({
        where: { id: binding.projectId! },
        select: { departmentId: true, deletedAt: true },
      });
      if (
        !project
        || project.deletedAt
        || project.departmentId !== binding.departmentId
      ) {
        throw new Error(
          `Project ${binding.projectId} does not belong to Department ${binding.departmentId}.`,
        );
      }
    }
  }
}

export class ExternalRoleBindingService {
  constructor(private readonly db: PrismaClient = prisma()) {}

  async replace(
    input: ReplaceExternalRoleBindingsInput,
    actor: string,
  ): Promise<ExternalRoleBindingView[]> {
    await this.db.$transaction(async (transaction) => {
      await validateTargets(transaction, input.bindings);
      const existing = await transaction.externalRoleBinding.findMany({
        where: {
          providerId: corporateSsoProviderId,
          subjectType: "GROUP",
        },
      });
      const byId = new Map(existing.map((binding) => [binding.id, binding]));
      const requestedIds = new Set(
        input.bindings.flatMap((binding) => binding.id ? [binding.id] : []),
      );

      for (const binding of existing) {
        const inputBinding = input.bindings.find(({ id }) => id === binding.id);
        if (
          !inputBinding
          || bindingChanged(binding, inputBinding)
          || (binding.enabled && !inputBinding.enabled)
        ) {
          await revokeExternalRoleBinding(transaction, binding);
        }
        if (!requestedIds.has(binding.id)) {
          await transaction.externalRoleBinding.delete({ where: { id: binding.id } });
        }
      }

      for (const binding of input.bindings) {
        const stored = binding.id ? byId.get(binding.id) : undefined;
        if (binding.id && !stored) {
          throw new Error(`External role binding ${binding.id} does not exist.`);
        }
        if (stored && sameBinding(stored, binding)) continue;
        const data = {
          subjectValue: binding.group,
          scope: binding.scope,
          departmentId: binding.departmentId,
          projectId: binding.projectId,
          roleId: binding.roleId,
          enabled: binding.enabled,
        } as const;
        if (stored) {
          await transaction.externalRoleBinding.update({
            where: { id: stored.id },
            data,
          });
        } else {
          await transaction.externalRoleBinding.create({
            data: {
              id: randomUUID(),
              providerId: corporateSsoProviderId,
              subjectType: "GROUP",
              createdBy: actor,
              ...data,
            },
          });
        }
      }
    });
    return this.list();
  }

  async list(): Promise<ExternalRoleBindingView[]> {
    const bindings = await this.db.externalRoleBinding.findMany({
      where: {
        providerId: corporateSsoProviderId,
        subjectType: "GROUP",
      },
      include: {
        department: { select: { name: true } },
        project: { select: { name: true } },
        grants: {
          select: { lastSeenAt: true },
          orderBy: { lastSeenAt: "desc" },
          take: 1,
        },
      },
      orderBy: [{ scope: "asc" }, { subjectValue: "asc" }],
    });
    return bindings.map((binding) => ({
      id: binding.id,
      enabled: binding.enabled,
      group: binding.subjectValue,
      scope: binding.scope,
      departmentId: binding.departmentId,
      departmentName: binding.department?.name ?? null,
      projectId: binding.projectId,
      projectName: binding.project?.name ?? null,
      roleId: binding.roleId as ExternalRoleId,
      lastMatchedAt: binding.grants[0]?.lastSeenAt.toISOString() ?? null,
    }));
  }
}
