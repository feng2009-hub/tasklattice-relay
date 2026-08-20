import type { PlatformPrincipal } from "../auth/auth";
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
  options: { requireActiveDepartment?: boolean } = {},
): Promise<string> {
  const userId = await requireActiveDepartmentUser(auth, database);
  const membership = await database.departmentMember.findUnique({
    where: { departmentId_userId: { departmentId, userId } },
    select: {
      role: true,
      status: true,
      department: { select: { status: true } },
    },
  });
  if (
    !membership ||
    membership.status !== "active" ||
    membership.role !== "administrator" ||
    (options.requireActiveDepartment &&
      membership.department.status !== "active")
  ) {
    throw new Error(
      "You do not have permission to administer this Department.",
    );
  }
  return userId;
}
