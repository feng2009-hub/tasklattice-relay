import { describe, expect, it } from "vitest";
import type { AuthPayload, AuthUser } from "../auth/auth";
import { createTestPrisma } from "../test/prisma";
import { WorkspaceService } from "./workspace-service";

function auth(user: AuthUser): AuthPayload {
  return {
    exp: Number.MAX_SAFE_INTEGER,
    iat: 0,
    iss: "tasklattice",
    sub: user.username,
    user,
  };
}

describe("WorkspaceService", () => {
  it("creates an Individual workspace and copies SQL-seeded metadata into teams", async () => {
    const db = createTestPrisma();
    const service = new WorkspaceService(db);
    const local = auth({
      displayName: "Local Administrator",
      email: "admin@tasklattice.local",
      provider: "local",
      username: "admin",
    });

    expect(await service.list(local)).toEqual([
      expect.objectContaining({
        id: "individual",
        name: "Individual",
        role: "owner",
        type: "personal",
      }),
    ]);

    const team = await service.create(local, "AI Platform");
    expect(team).toMatchObject({ name: "AI Platform", role: "owner", type: "team" });
    expect(await db.extensionSkillRecord.count({
      where: { workspaceId: team.id },
    })).toBe(await db.extensionSkillRecord.count({
      where: { workspaceId: "individual" },
    }));
  });

  it("enforces workspace roles and keeps records isolated by workspace", async () => {
    const db = createTestPrisma();
    const service = new WorkspaceService(db);
    const owner = auth({
      displayName: "Owner",
      email: "owner@tasklattice.local",
      provider: "sso",
      username: "owner",
    });
    const member = {
      displayName: "Member",
      email: "member@example.com",
      provider: "sso" as const,
      username: "member",
    };
    const ownerId = await service.ensureUser(owner);
    const memberId = await service.syncAuthUser(member);
    const team = await service.create(owner, "DevOps");

    await service.invite(team.id, ownerId, member.email, "member");
    await expect(service.requireRole(team.id, memberId, ["owner", "admin"]))
      .rejects.toThrow(/permission/i);

    await db.extensionSkillRecord.delete({
      where: {
        workspaceId_id: {
          workspaceId: team.id,
          id: "kubernetes-expert",
        },
      },
    });
    expect(await db.extensionSkillRecord.findUnique({
      where: {
        workspaceId_id: {
          workspaceId: "individual",
          id: "kubernetes-expert",
        },
      },
    })).not.toBeNull();
  });

  it("accepts a pending invitation when the invited user first signs in", async () => {
    const db = createTestPrisma();
    const service = new WorkspaceService(db);
    const owner = auth({
      displayName: "Owner",
      email: "owner@tasklattice.local",
      provider: "sso",
      username: "owner",
    });
    const ownerId = await service.ensureUser(owner);
    const team = await service.create(owner, "SRE");
    await service.invite(team.id, ownerId, "new-user@example.com", "admin");

    const invitedUser = auth({
      displayName: "New User",
      email: "new-user@example.com",
      provider: "sso",
      username: "new-user",
    });
    expect(await service.list(invitedUser)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: team.id, role: "admin" }),
    ]));
    expect(await db.workspaceInvitation.findFirst({
      where: { workspaceId: team.id, email: "new-user@example.com" },
    })).toMatchObject({ status: "accepted" });
  });
});
