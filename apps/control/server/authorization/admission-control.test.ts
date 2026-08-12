import { afterEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "../generated/prisma/client";
import { createTestPrisma } from "../test/prisma";
import { errorResponse } from "../http/responses";
import {
  CapabilityAdmissionError,
  ProjectAdmissionService,
  evaluateAdmission,
} from "./admission-control";
import { admissionEvidenceForRequest } from "./authorization-context";

let database: PrismaClient | undefined;

afterEach(async () => {
  await database?.$disconnect();
  database = undefined;
});

describe("capability admission evaluator", () => {
  it("allows a matching capability and resource relation", () => {
    expect(evaluateAdmission({
      actorId: "developer-1",
      capability: "CAP_AGENT_INSTANCE_DELETE",
      environment: "DEV",
      projectId: "project-1",
      relation: "OWNER",
      resourceType: "AgentInstance",
      roleIds: ["ROLE_AGENT_DEVELOPER"],
    })).toMatchObject({
      decision: "ALLOW",
      roleId: "ROLE_AGENT_DEVELOPER",
      relation: "OWNER",
    });
  });

  it("uses capability-level scopes and treats PROJECT_ANY as a grant wildcard", () => {
    expect(evaluateAdmission({
      actorId: "developer-1",
      capability: "CAP_PROJECT_QUOTA_VIEW",
      projectId: "project-1",
      relation: "PROJECT_ANY",
      resourceType: "ProjectQuota",
      roleIds: ["ROLE_AGENT_DEVELOPER"],
    }).decision).toBe("ALLOW");
    expect(evaluateAdmission({
      actorId: "developer-1",
      capability: "CAP_AGENT_INSTANCE_DELETE",
      projectId: "project-1",
      relation: "PROJECT_ANY",
      resourceType: "AgentInstance",
      roleIds: ["ROLE_AGENT_DEVELOPER"],
    }).decision).toBe("DENY");
    expect(evaluateAdmission({
      actorId: "admin-1",
      capability: "CAP_AGENT_INSTANCE_CONFIG_VIEW",
      projectId: "project-1",
      relation: "OWNER",
      resourceType: "AgentInstance",
      roleIds: ["ROLE_PROJECT_ADMIN"],
    }).decision).toBe("ALLOW");
  });

  it("fails closed when a capability or relation is missing", () => {
    expect(evaluateAdmission({
      actorId: "user-1",
      capability: "CAP_AGENT_INSTANCE_DELETE",
      projectId: "project-1",
      relation: "ASSIGNED",
      resourceType: "AgentInstance",
      roleIds: ["ROLE_USER"],
    }).decision).toBe("DENY");
    expect(evaluateAdmission({
      actorId: "developer-1",
      capability: "CAP_AGENT_INSTANCE_DELETE",
      projectId: "project-1",
      relation: "PROJECT_ANY",
      resourceType: "AgentInstance",
      roleIds: ["ROLE_AGENT_DEVELOPER"],
    })).toMatchObject({ decision: "DENY", roleId: "ROLE_AGENT_DEVELOPER" });
    expect(evaluateAdmission({
      actorId: "orphan",
      capability: "CAP_PROJECT_VIEW",
      projectId: "project-1",
      resourceType: "Project",
      roleIds: [],
    }).decision).toBe("DENY");
  });

  it("does not let the builtin Auditor read raw Instance sandbox audit", () => {
    const common = {
      actorId: "auditor-1",
      projectId: "project-1",
      relation: "PROJECT_ANY" as const,
      roleIds: ["ROLE_AUDITOR"] as const,
    };
    expect(evaluateAdmission({
      ...common,
      capability: "CAP_AUDIT_DETAIL_VIEW",
      resourceType: "AgentInstance",
    }).decision).toBe("ALLOW");
    expect(evaluateAdmission({
      ...common,
      capability: "CAP_AUDIT_SENSITIVE_CONTENT_VIEW",
      resourceType: "AgentInstanceAudit",
    }).decision).toBe("DENY");
  });

  it("prioritizes explicit deny and requires approval before PROD side effects", () => {
    expect(evaluateAdmission({
      actorId: "developer-1",
      capability: "CAP_AGENT_INSTANCE_DELETE",
      environment: "PROD",
      explicitDeny: true,
      projectId: "project-1",
      relation: "OWNER",
      resourceType: "AgentInstance",
      roleIds: ["ROLE_AGENT_DEVELOPER"],
    }).decision).toBe("DENY");
    const approval = evaluateAdmission({
      actorId: "developer-1",
      capability: "CAP_AGENT_INSTANCE_DELETE",
      environment: "PROD",
      projectId: "project-1",
      relation: "OWNER",
      resourceType: "AgentInstance",
      roleIds: ["ROLE_AGENT_DEVELOPER"],
    });
    expect(approval).toMatchObject({
      decision: "APPROVAL_REQUIRED",
      policyId: "builtin:prod:governed-change",
    });
    const response = errorResponse(new CapabilityAdmissionError(approval));
    expect(response.status).toBe(403);
    return expect(response.json()).resolves.toMatchObject({
      authorization: {
        capability: "CAP_AGENT_INSTANCE_DELETE",
        decision: "APPROVAL_REQUIRED",
        policyId: "builtin:prod:governed-change",
      },
    });
  });

  it("resolves every builtin membership role and records request-scoped evidence", async () => {
    database = createTestPrisma();
    const roles = [
      ["admin", "CAP_PROVIDER_VALIDATE", "PROJECT_ANY"],
      ["auditor", "CAP_AUDIT_DETAIL_VIEW", "PROJECT_ANY"],
      ["developer", "CAP_AGENT_INSTANCE_CREATE", "OWNER"],
      ["user", "CAP_AGENT_INSTANCE_INTERACT", "ASSIGNED"],
      ["approver", "CAP_APPROVAL_REQUEST_DECIDE", "PROJECT_ANY"],
    ] as const;
    await database.user.createMany({
      data: roles.map(([role]) => ({
        id: `user-${role}`,
        username: `user-${role}`,
        email: `${role}@example.test`,
        displayName: role,
      })),
    });
    await database.projectMember.createMany({
      data: roles.map(([role]) => ({
        projectId: "individual",
        userId: `user-${role}`,
        role,
      })),
    });
    const service = new ProjectAdmissionService(database);
    for (const [role, capability, relation] of roles) {
      const request = new Request("http://tali.test/api/v1/projects/individual/resource");
      await expect(service.authorize(
        request,
        `user-${role}`,
        capability,
        { relation, resourceType: "TestResource" },
      )).resolves.toMatchObject({ decision: "ALLOW" });
      expect(admissionEvidenceForRequest(request)).toHaveLength(1);
    }
  });

  it("loads the trusted authorization environment from the Project", async () => {
    database = createTestPrisma();
    const actorId = "environment-developer";
    await database.user.create({
      data: {
        id: actorId,
        username: actorId,
        email: `${actorId}@example.test`,
        displayName: "Environment Developer",
      },
    });
    await database.projectMember.create({
      data: { projectId: "individual", userId: actorId, role: "developer" },
    });
    await database.project.update({
      where: { id: "individual" },
      data: { authorizationEnvironment: "PROD" },
    });
    const request = new Request("http://tali.test/api/v1/projects/individual/resource");
    await expect(new ProjectAdmissionService(database).authorize(
      request,
      actorId,
      "CAP_AGENT_INSTANCE_DELETE",
      { relation: "OWNER", resourceType: "AgentInstance" },
    )).rejects.toBeInstanceOf(CapabilityAdmissionError);
    expect(admissionEvidenceForRequest(request)[0]).toMatchObject({
      decision: "APPROVAL_REQUIRED",
      environment: "PROD",
    });
  });

  it("gives only the personal Project administrator an explicit Developer composite binding", async () => {
    database = createTestPrisma();
    const service = new ProjectAdmissionService(database);
    await expect(service.authorize(
      new Request("http://tali.test/api/v1/projects/individual/resource"),
      "local-admin",
      "CAP_AGENT_INSTANCE_CREATE",
      { relation: "OWNER", resourceType: "AgentInstance" },
    )).resolves.toMatchObject({
      decision: "ALLOW",
      roleId: "ROLE_AGENT_DEVELOPER",
    });

    await database.project.create({
      data: {
        id: "team-admin-boundary",
        name: "Team Admin Boundary",
        type: "team",
        createdBy: "local-admin",
        humanMembers: { create: { userId: "local-admin", role: "admin" } },
      },
    });
    const request = new Request(
      "http://tali.test/api/v1/projects/team-admin-boundary/resource",
    );
    await expect(service.authorize(
      request,
      "local-admin",
      "CAP_AGENT_INSTANCE_CREATE",
      { relation: "OWNER", resourceType: "AgentInstance" },
    )).rejects.toBeInstanceOf(CapabilityAdmissionError);
    expect(admissionEvidenceForRequest(request)[0]?.decision).toBe("DENY");

    await database.user.create({
      data: {
        id: "sso-personal-admin",
        username: "sso-personal-admin",
        email: "sso-personal-admin@example.test",
        displayName: "SSO Personal Admin",
      },
    });
    await database.project.create({
      data: {
        id: "individual-hashed-id",
        name: "SSO Personal Project",
        type: "personal",
        authorizationEnvironment: "DEV",
        createdBy: "sso-personal-admin",
        humanMembers: {
          create: { userId: "sso-personal-admin", role: "admin" },
        },
      },
    });
    await expect(service.authorize(
      new Request(
        "http://tali.test/api/v1/projects/individual-hashed-id/resource",
      ),
      "sso-personal-admin",
      "CAP_AGENT_INSTANCE_CREATE",
      { relation: "OWNER", resourceType: "AgentInstance" },
    )).resolves.toMatchObject({ decision: "ALLOW" });
  });

  it("does not let a system super-administrator bypass Project membership", async () => {
    database = createTestPrisma();
    const service = new ProjectAdmissionService(database);
    const request = new Request("http://tali.test/api/v1/projects/individual/resource");
    await expect(service.authorize(
      request,
      "missing-super-admin",
      "CAP_PROJECT_SETTINGS_UPDATE",
      { resourceType: "Project" },
    )).rejects.toBeInstanceOf(CapabilityAdmissionError);
    expect(admissionEvidenceForRequest(request)[0]).toMatchObject({
      decision: "DENY",
      reason: "The actor has no Project role binding.",
    });
  });
});
