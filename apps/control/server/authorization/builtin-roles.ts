import type {
  BuiltinProjectRoleId,
  ProjectMembershipRole,
} from "@tali/contracts";
import type { PrismaClient } from "../generated/prisma/client";
import {
  membershipRoleToBuiltinRole,
  RoleCatalogService,
} from "./role-catalog";

export { membershipRoleToBuiltinRole } from "./role-catalog";

export async function builtinProjectRoles(database?: PrismaClient) {
  const catalog = await new RoleCatalogService(database).catalog();
  return catalog.roles.filter((role) => role.scope === "PROJECT");
}

export async function builtinRoleForMembership(
  membershipRole: ProjectMembershipRole,
  database?: PrismaClient,
) {
  return new RoleCatalogService(database).role(
    membershipRoleToBuiltinRole[membershipRole],
  );
}

export async function builtinRole(
  id: BuiltinProjectRoleId,
  database?: PrismaClient,
) {
  return new RoleCatalogService(database).role(id);
}
