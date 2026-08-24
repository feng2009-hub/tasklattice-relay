import type {
  BuiltinProjectRoleId,
  ProjectCapability,
  ProjectMembershipRole,
} from "@tali/contracts";
import { prisma } from "../db/prisma";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import {
  membershipRoleToBuiltinRole,
} from "../authorization/builtin-roles";
import { RoleCatalogService } from "../authorization/role-catalog";

export type ProjectRole = ProjectMembershipRole;

export interface ProjectAccessView {
  assignedRoles: readonly ProjectRole[];
  activeRole: ProjectRole;
  effectiveCapabilities: readonly ProjectCapability[];
}

export interface MembershipAccessRecord {
  externalAccessActive?: boolean;
  manualAccess?: boolean;
  role: ProjectRole;
  roleAssignments: readonly {
    externalAssignmentActive?: boolean;
    manualAssignment?: boolean;
    role: ProjectRole;
  }[];
}

function uniqueRoles(roles: readonly ProjectRole[]): ProjectRole[] {
  return Array.from(new Set(roles));
}

function membershipRoleState(
  membership: MembershipAccessRecord,
) {
  const assignedRoles = uniqueRoles([
    ...membership.roleAssignments
      .filter(({ externalAssignmentActive, manualAssignment }) =>
        manualAssignment !== false || externalAssignmentActive === true
      )
      .map(({ role }) => role),
    ...(membership.manualAccess !== false ? [membership.role] : []),
  ]);
  const activeRole = assignedRoles.includes(membership.role)
    ? membership.role
    : assignedRoles[0] ?? membership.role;
  return { assignedRoles, activeRole };
}

export function activeRoleForMembership(
  membership: MembershipAccessRecord,
): ProjectRole {
  return membershipRoleState(membership).activeRole;
}

export async function accessForMembership(
  membership: MembershipAccessRecord,
  database: PrismaClient | Prisma.TransactionClient = prisma(),
): Promise<ProjectAccessView> {
  const state = membershipRoleState(membership);
  const role = await new RoleCatalogService(database).role(
    membershipRoleToBuiltinRole[state.activeRole],
  );
  return {
    ...state,
    effectiveCapabilities: role.capabilities.filter(
      (capability): capability is ProjectCapability =>
        capability.startsWith("CAP_")
        && !capability.startsWith("CAP_PLATFORM_")
        && !capability.startsWith("CAP_DEPARTMENT_"),
    ),
  };
}

export function membershipHasAccess(
  membership: Pick<MembershipAccessRecord, "externalAccessActive" | "manualAccess">,
): boolean {
  return membership.manualAccess !== false
    || membership.externalAccessActive === true;
}

export function activeBuiltinRoleIds(
  membership: MembershipAccessRecord,
): BuiltinProjectRoleId[] {
  if (!membershipHasAccess(membership)) return [];
  return [membershipRoleToBuiltinRole[membershipRoleState(membership).activeRole]];
}

export const membershipAccessInclude = {
  roleAssignments: {
    select: {
      role: true,
      manualAssignment: true,
      externalAssignmentActive: true,
    },
    orderBy: { assignedAt: "asc" },
  },
} as const satisfies Prisma.ProjectMemberInclude;

export async function projectAccessForMember(
  database: PrismaClient | Prisma.TransactionClient,
  projectId: string,
  userId: string,
): Promise<ProjectAccessView | undefined> {
  const membership = await database.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    include: membershipAccessInclude,
  });
  return membership && membershipHasAccess(membership)
    ? accessForMembership(
      membership as MembershipAccessRecord,
      database,
    )
    : undefined;
}
