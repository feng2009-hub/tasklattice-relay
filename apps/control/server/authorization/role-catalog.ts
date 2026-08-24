import {
  authorizationCapabilities,
  builtinRoleFamilies,
  builtinRoleIds,
  departmentCapabilities,
  platformCapabilities,
  projectCapabilityCatalog,
  resourceRelations,
  type AuthorizationCapability,
  type AuthorizationCapabilityDefinitionView,
  type AuthorizationScope,
  type BuiltinRoleCatalogView,
  type BuiltinRoleFamily,
  type BuiltinRoleId,
  type BuiltinRoleView,
  type ResourceRelation,
} from "@tali/contracts";
import builtinRoleCatalog from "../config/builtin-role-catalog.json";
import { prisma } from "../db/prisma";
import type {
  Prisma,
  PrismaClient,
} from "../generated/prisma/client";

type Database = PrismaClient | Prisma.TransactionClient;

interface ConfiguredGrant {
  capability: AuthorizationCapability;
  relations: ResourceRelation[];
}

interface ConfiguredRole {
  id: BuiltinRoleId;
  scope: AuthorizationScope;
  family: BuiltinRoleFamily;
  name: string;
  description: string;
  assignable: true;
  sortOrder: number;
  grants: ConfiguredGrant[];
}

interface ConfiguredCatalog {
  revision: number;
  roles: ConfiguredRole[];
}

const capabilityIds = new Set<string>(authorizationCapabilities);
const roleIds = new Set<string>(builtinRoleIds);
const relationIds = new Set<string>(resourceRelations);
const roleFamilies = new Set<string>(builtinRoleFamilies);

function configuredCatalog(): ConfiguredCatalog {
  const candidate = builtinRoleCatalog as unknown as ConfiguredCatalog;
  if (!Number.isInteger(candidate.revision) || candidate.revision < 1) {
    throw new Error("The builtin Role catalog revision is invalid.");
  }
  if (candidate.roles.length !== builtinRoleIds.length) {
    throw new Error("The builtin Role catalog must define exactly seven Roles.");
  }
  const configuredRoleIds = new Set(candidate.roles.map(({ id }) => id));
  if (
    configuredRoleIds.size !== builtinRoleIds.length
    || builtinRoleIds.some((id) => !configuredRoleIds.has(id))
  ) {
    throw new Error("The builtin Role catalog does not match the registered Role IDs.");
  }
  for (const role of candidate.roles) {
    if (!roleIds.has(role.id) || !roleFamilies.has(role.family)) {
      throw new Error(`The builtin Role ${role.id} has an invalid identity or family.`);
    }
    const grantIds = new Set<string>();
    for (const grant of role.grants) {
      if (!capabilityIds.has(grant.capability) || grantIds.has(grant.capability)) {
        throw new Error(`The builtin Role ${role.id} has an invalid or duplicate Capability grant.`);
      }
      grantIds.add(grant.capability);
      if (grant.relations.some((relation) => !relationIds.has(relation))) {
        throw new Error(`The builtin Role ${role.id} has an invalid resource relation.`);
      }
      const capabilityScope = grant.capability.startsWith("CAP_PLATFORM_")
        ? "PLATFORM"
        : grant.capability.startsWith("CAP_DEPARTMENT_")
          ? "DEPARTMENT"
          : "PROJECT";
      if (capabilityScope !== role.scope) {
        throw new Error(`The builtin Role ${role.id} crosses authorization scopes.`);
      }
    }
  }
  return candidate;
}

const catalog = configuredCatalog();

function genericCapabilityDefinition(
  id: AuthorizationCapability,
  scope: AuthorizationScope,
  sortOrder: number,
): AuthorizationCapabilityDefinitionView & { sortOrder: number } {
  const readOnly = id.endsWith("_VIEW");
  return {
    id,
    scope,
    sideEffect: !readOnly,
    sensitiveContent:
      id === "CAP_PLATFORM_SECURITY_UPDATE"
      || id === "CAP_PLATFORM_EMAIL_UPDATE",
    systemManaged: true,
    sortOrder,
  };
}

const capabilityDefinitions = [
  ...platformCapabilities.map((id, index) =>
    genericCapabilityDefinition(id, "PLATFORM", index),
  ),
  ...departmentCapabilities.map((id, index) =>
    genericCapabilityDefinition(id, "DEPARTMENT", index),
  ),
  ...projectCapabilityCatalog.map((definition, index) => ({
    ...definition,
    scope: "PROJECT" as const,
    systemManaged: true as const,
    sortOrder: index,
  })),
];

export const membershipRoleToBuiltinRole = Object.freeze({
  admin: "ROLE_PROJECT_ADMIN",
  auditor: "ROLE_AUDITOR",
  developer: "ROLE_AGENT_DEVELOPER",
  user: "ROLE_USER",
  reviewer: "ROLE_REVIEWER",
} as const);

async function synchronizeBuiltinRoleCatalog(
  transaction: Database,
): Promise<void> {
    await transaction.roleCapabilityGrant.deleteMany({
      where: { roleId: { in: [...builtinRoleIds] } },
    });
    await transaction.roleDefinition.deleteMany({
      where: { id: { in: [...builtinRoleIds] } },
    });
    await transaction.capabilityDefinition.deleteMany({
      where: { systemManaged: true },
    });
    await transaction.capabilityDefinition.createMany({
      data: capabilityDefinitions.map((capability) => ({
        id: capability.id,
        scope: capability.scope,
        sideEffect: capability.sideEffect,
        sensitiveContent: capability.sensitiveContent,
        systemManaged: true,
        sortOrder: capability.sortOrder,
      })),
    });
    await transaction.roleDefinition.createMany({
      data: catalog.roles.map((role) => ({
        id: role.id,
        scope: role.scope,
        family: role.family,
        name: role.name,
        description: role.description,
        builtin: true,
        assignable: role.assignable,
        systemManaged: true,
        sortOrder: role.sortOrder,
        revision: catalog.revision,
      })),
    });
    await transaction.roleCapabilityGrant.createMany({
      data: catalog.roles.flatMap((role) => role.grants.map((grant) => ({
        roleId: role.id,
        capabilityId: grant.capability,
        relations: grant.relations,
      }))),
    });

    await transaction.roleCatalogState.upsert({
      where: { id: "builtin" },
      create: { id: "builtin", revision: catalog.revision },
      update: { revision: catalog.revision, syncedAt: new Date() },
    });
}

export async function ensureBuiltinRoleCatalog(
  database: Database = prisma(),
): Promise<void> {
  const state = await database.roleCatalogState.findUnique({
    where: { id: "builtin" },
    select: { revision: true },
  });
  if (state?.revision === catalog.revision) return;

  if ("$transaction" in database) {
    await (database as PrismaClient).$transaction(
      (transaction) => synchronizeBuiltinRoleCatalog(transaction),
    );
    return;
  }
  await synchronizeBuiltinRoleCatalog(database);
}

function relations(value: Prisma.JsonValue): ResourceRelation[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (relation): relation is ResourceRelation =>
      typeof relation === "string" && relationIds.has(relation),
  );
}

const roleInclude = {
  grants: {
    include: { capability: true },
    orderBy: { capability: { sortOrder: "asc" } },
  },
} as const satisfies Prisma.RoleDefinitionInclude;

type RoleRecord = Prisma.RoleDefinitionGetPayload<{ include: typeof roleInclude }>;

function roleView(role: RoleRecord): BuiltinRoleView {
  const grants = role.grants.map((grant) => ({
    capability: grant.capabilityId as AuthorizationCapability,
    relations: relations(grant.relations),
  }));
  return {
    id: role.id as BuiltinRoleId,
    scope: role.scope,
    family: role.family,
    name: role.name,
    description: role.description,
    builtin: true,
    assignable: true,
    systemManaged: true,
    immutable: true,
    revision: role.revision,
    grants,
    capabilities: grants.map(({ capability }) => capability),
    relations: Array.from(new Set(grants.flatMap((grant) => grant.relations))),
  };
}

export class RoleCatalogService {
  constructor(private readonly db: Database = prisma()) {}

  async catalog(): Promise<BuiltinRoleCatalogView> {
    await ensureBuiltinRoleCatalog(this.db);
    const [state, capabilities, roles] = await Promise.all([
      this.db.roleCatalogState.findUniqueOrThrow({ where: { id: "builtin" } }),
      this.db.capabilityDefinition.findMany({ orderBy: [{ scope: "asc" }, { sortOrder: "asc" }] }),
      this.db.roleDefinition.findMany({
        where: { builtin: true },
        include: roleInclude,
        orderBy: { sortOrder: "asc" },
      }),
    ]);
    return {
      revision: state.revision,
      capabilities: capabilities.map((capability) => ({
        id: capability.id as AuthorizationCapability,
        scope: capability.scope,
        sideEffect: capability.sideEffect,
        sensitiveContent: capability.sensitiveContent,
        systemManaged: true,
      })),
      roles: roles.map(roleView),
    };
  }

  async role(id: BuiltinRoleId): Promise<BuiltinRoleView> {
    await ensureBuiltinRoleCatalog(this.db);
    const role = await this.db.roleDefinition.findUnique({
      where: { id },
      include: roleInclude,
    });
    if (!role || !role.builtin) throw new Error(`Builtin Role ${id} is unavailable.`);
    return roleView(role);
  }

  async roles(ids: readonly BuiltinRoleId[]): Promise<BuiltinRoleView[]> {
    await ensureBuiltinRoleCatalog(this.db);
    const roles = await this.db.roleDefinition.findMany({
      where: { id: { in: [...ids] }, builtin: true },
      include: roleInclude,
      orderBy: { sortOrder: "asc" },
    });
    return roles.map(roleView);
  }

  async hasCapability(
    roleId: BuiltinRoleId,
    capability: AuthorizationCapability,
  ): Promise<boolean> {
    await ensureBuiltinRoleCatalog(this.db);
    return Boolean(await this.db.roleCapabilityGrant.findUnique({
      where: { roleId_capabilityId: { roleId, capabilityId: capability } },
      select: { roleId: true },
    }));
  }
}

export function configuredBuiltinRoleCatalogRevision(): number {
  return catalog.revision;
}
