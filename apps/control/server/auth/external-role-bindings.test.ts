import { beforeEach, describe, expect, it } from "vitest";
import { createTestPrisma } from "../test/prisma";
import { DepartmentService } from "../departments/department-service";
import {
  corporateSsoProviderId,
  groupsFromVerifiedIdToken,
  synchronizeExternalRoleBindings,
} from "./external-role-bindings";

function idToken(payload: Record<string, unknown>): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode(payload)}.signature`;
}

describe("external SSO role bindings", () => {
  const db = createTestPrisma();

  beforeEach(async () => {
    globalThis.taliPrisma = db;
    await db.externalRoleGrant.deleteMany();
    await db.externalRoleBinding.deleteMany();
    await db.projectMemberRoleAssignment.deleteMany({
      where: { userId: "keycloak-alice" },
    });
    await db.projectMember.deleteMany({ where: { userId: "keycloak-alice" } });
    await db.departmentMember.deleteMany({ where: { userId: "keycloak-alice" } });
    await db.user.deleteMany({ where: { id: "keycloak-alice" } });
    await db.user.create({
      data: {
        id: "keycloak-alice",
        username: "keycloak-alice",
        email: "alice@tali.test",
        displayName: "Alice Operator",
      },
    });
  });

  it("reads exact Group paths from the configured verified token claim", () => {
    const token = idToken({
      groups: [
        "/tali/platform/roles/ROLE_PLATFORM_ADMIN",
        "/tali/departments/dep1/projects/individual/roles/ROLE_AGENT_DEVELOPER",
        "/tali/platform/roles/ROLE_PLATFORM_ADMIN",
      ],
    });
    expect(groupsFromVerifiedIdToken(token, "groups")).toEqual([
      "/tali/platform/roles/ROLE_PLATFORM_ADMIN",
      "/tali/departments/dep1/projects/individual/roles/ROLE_AGENT_DEVELOPER",
    ]);
    expect(() => groupsFromVerifiedIdToken(idToken({ groups: { bad: true } }), "groups"))
      .toThrow("must be a string or string array");
  });

  it("projects matched Group grants and revokes only the external access", async () => {
    await db.externalRoleBinding.createMany({
      data: [
        {
          id: "binding-platform-admin",
          providerId: corporateSsoProviderId,
          subjectType: "GROUP",
          subjectValue: "/tali/platform/roles/ROLE_PLATFORM_ADMIN",
          scope: "PLATFORM",
          roleId: "ROLE_PLATFORM_ADMIN",
        },
        {
          id: "binding-project-developer",
          providerId: corporateSsoProviderId,
          subjectType: "GROUP",
          subjectValue: "/tali/departments/dep1/projects/individual/roles/ROLE_AGENT_DEVELOPER",
          scope: "PROJECT",
          departmentId: "dep1",
          projectId: "individual",
          roleId: "ROLE_AGENT_DEVELOPER",
        },
      ],
    });

    const granted = await synchronizeExternalRoleBindings(
      "keycloak-alice",
      idToken({
        groups: [
          "/tali/platform/roles/ROLE_PLATFORM_ADMIN",
          "/tali/departments/dep1/projects/individual/roles/ROLE_AGENT_DEVELOPER",
        ],
      }),
      "groups",
      db,
    );
    expect(granted.matchedBindingIds).toHaveLength(2);
    await expect(db.user.findUniqueOrThrow({ where: { id: "keycloak-alice" } }))
      .resolves.toMatchObject({ externalPlatformAdministrator: true });
    await expect(db.projectMember.findUniqueOrThrow({
      where: {
        projectId_userId: { projectId: "individual", userId: "keycloak-alice" },
      },
    })).resolves.toMatchObject({
      externalAccessActive: true,
      manualAccess: false,
      role: "developer",
    });
    await expect(db.projectMemberRoleAssignment.findUniqueOrThrow({
      where: {
        projectId_userId_role: {
          projectId: "individual",
          userId: "keycloak-alice",
          role: "developer",
        },
      },
    })).resolves.toMatchObject({
      externalAssignmentActive: true,
      manualAssignment: false,
    });

    await synchronizeExternalRoleBindings(
      "keycloak-alice",
      idToken({ groups: [] }),
      "groups",
      db,
    );
    await expect(db.user.findUniqueOrThrow({ where: { id: "keycloak-alice" } }))
      .resolves.toMatchObject({ externalPlatformAdministrator: false });
    await expect(db.projectMember.findUniqueOrThrow({
      where: {
        projectId_userId: { projectId: "individual", userId: "keycloak-alice" },
      },
    })).resolves.toMatchObject({ externalAccessActive: false, manualAccess: false });
    await expect(db.projectMemberRoleAssignment.findUniqueOrThrow({
      where: {
        projectId_userId_role: {
          projectId: "individual",
          userId: "keycloak-alice",
          role: "developer",
        },
      },
    })).resolves.toMatchObject({
      externalAssignmentActive: false,
      manualAssignment: false,
    });
  });

  it("maps a Department Administrator Group to the persisted Department Role", async () => {
    await db.externalRoleBinding.create({
      data: {
        id: "binding-department-admin",
        providerId: corporateSsoProviderId,
        subjectType: "GROUP",
        subjectValue: "/tali/departments/dep1/roles/ROLE_DEPARTMENT_ADMIN",
        scope: "DEPARTMENT",
        departmentId: "dep1",
        roleId: "ROLE_DEPARTMENT_ADMIN",
      },
    });

    await synchronizeExternalRoleBindings(
      "keycloak-alice",
      idToken({
        groups: ["/tali/departments/dep1/roles/ROLE_DEPARTMENT_ADMIN"],
      }),
      "groups",
      db,
    );

    await expect(db.departmentMember.findUniqueOrThrow({
      where: {
        departmentId_userId: { departmentId: "dep1", userId: "keycloak-alice" },
      },
    })).resolves.toMatchObject({
      externalAccessActive: true,
      manualAccess: false,
      role: "administrator",
    });
    await expect(new DepartmentService(db).list({
      user: {
        displayName: "Alice Operator",
        email: "alice@tali.test",
        hasPassword: false,
        id: "keycloak-alice",
        systemRole: "user",
        username: "keycloak-alice",
      },
    })).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "dep1", role: "administrator" }),
    ]));
  });

  it("activates Project Administrator first when SSO assigns several Project roles", async () => {
    await db.externalRoleBinding.createMany({
      data: [
        {
          id: "binding-project-developer",
          providerId: corporateSsoProviderId,
          subjectType: "GROUP",
          subjectValue: "/tali/departments/dep1/projects/individual/roles/ROLE_AGENT_DEVELOPER",
          scope: "PROJECT",
          departmentId: "dep1",
          projectId: "individual",
          roleId: "ROLE_AGENT_DEVELOPER",
        },
        {
          id: "binding-project-admin",
          providerId: corporateSsoProviderId,
          subjectType: "GROUP",
          subjectValue: "/tali/departments/dep1/projects/individual/roles/ROLE_PROJECT_ADMIN",
          scope: "PROJECT",
          departmentId: "dep1",
          projectId: "individual",
          roleId: "ROLE_PROJECT_ADMIN",
        },
      ],
    });

    await synchronizeExternalRoleBindings(
      "keycloak-alice",
      idToken({
        groups: [
          "/tali/departments/dep1/projects/individual/roles/ROLE_AGENT_DEVELOPER",
          "/tali/departments/dep1/projects/individual/roles/ROLE_PROJECT_ADMIN",
        ],
      }),
      "groups",
      db,
    );

    await expect(db.projectMember.findUniqueOrThrow({
      where: {
        projectId_userId: { projectId: "individual", userId: "keycloak-alice" },
      },
    })).resolves.toMatchObject({ role: "admin" });
    await expect(db.projectMemberRoleAssignment.findMany({
      where: { projectId: "individual", userId: "keycloak-alice" },
      orderBy: { role: "asc" },
    })).resolves.toMatchObject([
      { role: "admin", externalAssignmentActive: true },
      { role: "developer", externalAssignmentActive: true },
    ]);
  });
});
