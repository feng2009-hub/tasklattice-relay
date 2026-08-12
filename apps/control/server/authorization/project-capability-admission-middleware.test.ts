import type { AuthUser } from "../auth/auth";
import { signAuthToken } from "../auth/auth";
import {
  developmentControlConfig,
  setControlConfigForTests,
} from "../config/control-config";
import type { PrismaClient } from "../generated/prisma/client";
import { createTestPrisma } from "../test/prisma";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  admissionEvidenceForRequest,
  isProjectAdmissionComplete,
} from "../authorization/authorization-context";

type AdmissionMiddleware = (event: {
  context: Record<string, unknown>;
  req: Request;
}) => Promise<Response | undefined> | Response | undefined;

let database: PrismaClient;

const users = {
  developer: {
    displayName: "Agent Developer",
    email: "developer@example.test",
    id: "middleware-developer",
    provider: "sso",
    systemRole: "user",
    username: "middleware-developer",
  },
  user: {
    displayName: "User",
    email: "user@example.test",
    id: "middleware-user",
    provider: "sso",
    systemRole: "user",
    username: "middleware-user",
  },
} as const satisfies Record<string, AuthUser>;

function authorizedRequest(
  user: AuthUser,
  path: string,
  init: RequestInit = {},
): Request {
  const request = new Request(`http://tali.test${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${signAuthToken(user).token}`,
      ...init.headers,
    },
  });
  (request as Request & { context: Record<string, unknown> }).context = {};
  return request;
}

async function middleware(): Promise<AdmissionMiddleware> {
  const module = await import("../middleware/project-capability-admission");
  return module.default as unknown as AdmissionMiddleware;
}

beforeEach(async () => {
  vi.resetModules();
  setControlConfigForTests(developmentControlConfig());
  database = createTestPrisma();
  globalThis.taliPrisma = database;
  await database.user.createMany({
    data: Object.values(users).map((user) => ({
      displayName: user.displayName,
      email: user.email,
      id: user.id,
      systemRole: user.systemRole,
      username: user.username,
    })),
  });
  await database.projectMember.createMany({
    data: [
      {
        projectId: "individual",
        userId: users.developer.id,
        role: "developer",
      },
      {
        projectId: "individual",
        userId: users.user.id,
        role: "user",
      },
    ],
  });
  await database.agentRecord.createMany({
    data: [
      {
        createdAt: new Date(),
        id: "owned-agent",
        ownerUserId: users.developer.id,
        payload: { id: "owned-agent" },
        projectId: "individual",
      },
      {
        createdAt: new Date(),
        id: "other-agent",
        ownerUserId: "local-admin",
        payload: { id: "other-agent" },
        projectId: "individual",
      },
    ],
  });
});

afterEach(async () => {
  globalThis.taliPrisma = undefined;
  setControlConfigForTests(undefined);
  await database.$disconnect();
  vi.resetModules();
});

describe("Project Capability admission middleware", () => {
  it("proves OWNER from the database and marks an admitted request", async () => {
    const request = authorizedRequest(
      users.developer,
      "/api/v1/projects/individual/instances/owned-agent",
    );
    await expect((await middleware())({ context: {}, req: request }))
      .resolves.toBeUndefined();
    expect(isProjectAdmissionComplete(request)).toBe(true);
    expect(admissionEvidenceForRequest(request)).toEqual([
      expect.objectContaining({
        capability: "CAP_AGENT_INSTANCE_CONFIG_VIEW",
        decision: "ALLOW",
        relation: "OWNER",
        resourceId: "owned-agent",
        roleId: "ROLE_AGENT_DEVELOPER",
      }),
    ]);
  });

  it("denies a Developer before the handler when the Agent is not owned", async () => {
    const request = authorizedRequest(
      users.developer,
      "/api/v1/projects/individual/instances/other-agent",
    );
    const response = await (await middleware())({ context: {}, req: request });
    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toMatchObject({
      authorization: {
        capability: "CAP_AGENT_INSTANCE_CONFIG_VIEW",
        decision: "DENY",
      },
    });
    expect(isProjectAdmissionComplete(request)).toBe(false);
    expect(admissionEvidenceForRequest(request)[0]).toMatchObject({
      decision: "DENY",
      relation: "PROJECT_ANY",
    });
  });

  it("does not synthesize ASSIGNED from the User role", async () => {
    const request = authorizedRequest(
      users.user,
      "/api/v1/projects/individual/instances",
    );
    const response = await (await middleware())({ context: {}, req: request });
    expect(response?.status).toBe(403);
    expect(admissionEvidenceForRequest(request)[0]).toMatchObject({
      capability: "CAP_AGENT_INSTANCE_CONFIG_VIEW",
      decision: "DENY",
      relation: "PROJECT_ANY",
    });
  });

  it("checks body-derived Memory and binding CAPs on a trailing-slash create", async () => {
    const request = authorizedRequest(
      users.developer,
      "/api/v1/projects/individual/instances/",
      {
        body: JSON.stringify({ agentPlatform: "openclaw" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    );
    await expect((await middleware())({ context: {}, req: request }))
      .resolves.toBeUndefined();
    expect(admissionEvidenceForRequest(request).map(({ capability }) => capability))
      .toEqual([
        "CAP_AGENT_INSTANCE_CREATE",
        "CAP_AGENT_INSTANCE_ACCESS_POLICY_ASSIGN",
        "CAP_AGENT_INSTANCE_MODEL_ROUTING_ASSIGN",
        "CAP_AGENT_MEMORY_CONFIG_UPDATE",
      ]);
  });

  it("fails closed for an undeclared nested Project route", async () => {
    const request = authorizedRequest(
      users.developer,
      "/api/v1/projects/individual/instances/owned-agent/logs/raw",
    );
    const response = await (await middleware())({ context: {}, req: request });
    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toMatchObject({
      error: expect.stringMatching(/no Capability admission policy/i),
    });
  });
});
