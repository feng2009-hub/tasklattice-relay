import type {
  BuiltinProjectRoleId,
  ProjectCapability,
  ProjectMembershipRole,
} from "@tali/contracts";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import {
  builtinRoleForMembership,
  membershipRoleToBuiltinRole,
} from "../authorization/builtin-roles";

export type ProjectRole = ProjectMembershipRole;

export interface ProjectAccessView {
  assignedRoles: readonly ProjectRole[];
  activeRole: ProjectRole;
  effectiveCapabilities: readonly ProjectCapability[];
}

export interface MembershipAccessRecord {
  role: ProjectRole;
  roleAssignments: readonly {
    role: ProjectRole;
  }[];
}

function uniqueRoles(roles: readonly ProjectRole[]): ProjectRole[] {
  return Array.from(new Set(roles));
}

export function accessForMembership(
  membership: MembershipAccessRecord,
): ProjectAccessView {
  const assignedRoles = uniqueRoles([
    ...membership.roleAssignments.map(({ role }) => role),
    membership.role,
  ]);
  const effectiveCapabilities = builtinRoleForMembership(
    membership.role,
  ).capabilities;

  return {
    assignedRoles,
    activeRole: membership.role,
    effectiveCapabilities,
  };
}

export function activeBuiltinRoleIds(
  membership: MembershipAccessRecord,
): BuiltinProjectRoleId[] {
  return [membershipRoleToBuiltinRole[membership.role]];
}

export const membershipAccessInclude = {
  roleAssignments: {
    select: { role: true },
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
  return membership
    ? accessForMembership(membership as MembershipAccessRecord)
    : undefined;
}
