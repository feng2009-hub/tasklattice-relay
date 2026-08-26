import type { DepartmentCapability } from "@tali/contracts";
import type { PlatformPrincipal } from "../auth/auth";
import { RoleCatalogService } from "../authorization/role-catalog";
import { prisma } from "../db/prisma";
import type { PrismaClient } from "../generated/prisma/client";

export async function requireActiveDepartmentUser(
  auth: PlatformPrincipal,
  database: PrismaClient = prisma(),
): Promise<string> {
  const user = await database.user.findUnique({
    where: { id: auth.user.id },
    select: { id: true, status: true },
  });
  if (!user || user.status !== "active") {
    throw new Error(
      "The authenticated TaskLattice Relay user is unavailable.",
    );
  }
  return user.id;
}

export async function requireDepartmentAdministrator(
  auth: PlatformPrincipal,
  departmentId: string,
  database: PrismaClient = prisma(),
  options: {
    capability?: DepartmentCapability;
    requireActiveDepartment?: boolean;
  } = {},
): Promise<string> {
  if (
    auth.sessionId
    && (
      auth.accessContext?.level !== "department"
      || auth.accessContext.resourceId !== departmentId
      || auth.accessContext.roleId !== "ROLE_DEPARTMENT_ADMIN"
    )
  ) {
    throw new Error(
      "Access denied: select this Department Administrator access for the session.",
    );
  }
  const userId = await requireActiveDepartmentUser(auth, database);
  const [membership, externalAdministrator] = await Promise.all([
    database.departmentMember.findUnique({
      where: { departmentId_userId: { departmentId, userId } },
      select: {
        role: true,
        status: true,
        manualAccess: true,
        externalAccessActive: true,
        department: { select: { status: true } },
      },
    }),
    database.externalRoleGrant.findFirst({
      where: {
        userId,
        binding: {
          enabled: true,
          scope: "DEPARTMENT",
          departmentId,
          roleId: "ROLE_DEPARTMENT_ADMIN",
        },
      },
      select: { bindingId: true },
    }),
  ]);
  const hasAdministratorRole = Boolean(externalAdministrator)
    || (membership?.manualAccess && membership.role === "administrator");
  if (
    !membership ||
    membership.status !== "active" ||
    (!membership.manualAccess && !membership.externalAccessActive) ||
    !hasAdministratorRole ||
    (options.requireActiveDepartment &&
      membership.department.status !== "active")
  ) {
    throw new Error(
      "You do not have permission to administer this Department.",
    );
  }
  const capability = options.capability ?? "CAP_DEPARTMENT_VIEW";
  if (!await new RoleCatalogService(database).hasCapability(
    "ROLE_DEPARTMENT_ADMIN",
    capability,
  )) {
    throw new Error(`Department Administrator does not grant ${capability}.`);
  }
  return userId;
}
