import { describe, expect, it } from "vitest";
import type { AuthPayload, AuthUser } from "../auth/auth";
import { createTestPrisma } from "../test/prisma";
import { ProjectService } from "./project-service";

function auth(user: AuthUser): AuthPayload {
  return {
    exp: Number.MAX_SAFE_INTEGER,
    iat: 0,
    iss: "tasklattice",
    sub: user.username,
    user,
  };
}

describe("ProjectService", () => {
  it("creates the default project and copies SQL-seeded metadata into teams", async () => {
    const db = createTestPrisma();
    const service = new ProjectService(db);
    const local = auth({
      displayName: "Local Administrator",
      email: "admin@tasklattice.local",
      provider: "local",
      username: "admin",
    });

    expect(await service.list(local)).toEqual([
      expect.objectContaining({
        id: "individual",
        name: "admin",
        role: "admin",
        type: "personal",
      }),
    ]);

    const team = await service.create(local, "AI Platform");
    expect(team).toMatchObject({ name: "AI Platform", role: "admin", type: "team" });
    expect(await db.extensionSkillRecord.count({
      where: { projectId: team.id },
    })).toBe(await db.extensionSkillRecord.count({
      where: { projectId: "individual" },
    }));
  });

  it("creates one personal project named after each username", async () => {
    const db = createTestPrisma();
    const service = new ProjectService(db);
    const alex = auth({
      displayName: "Alex Chen",
      email: "alex@example.com",
      provider: "sso",
      username: "alex",
    });

    expect(await service.list(alex)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "alex",
          role: "admin",
          type: "personal",
        }),
      ]),
    );

    const alexId = await service.ensureUser(alex);
    const [personalProject] = await service.list(alex);
    await expect(
      service.rename(personalProject!.id, alexId, "Renamed"),
    ).rejects.toThrow(/matches its username/i);
  });

  it("enforces project roles and keeps records isolated by project", async () => {
    const db = createTestPrisma();
    const service = new ProjectService(db);
    const administrator = auth({
      displayName: "Administrator",
      email: "administrator@tasklattice.local",
      provider: "sso",
      username: "administrator",
    });
    const member = {
      displayName: "Member",
      email: "member@example.com",
      provider: "sso" as const,
      username: "member",
    };
    const administratorId = await service.ensureUser(administrator);
    const memberId = await service.syncAuthUser(member);
    const team = await service.create(administrator, "DevOps");

    await service.invite(
      team.id,
      administratorId,
      member.email,
      "member",
    );
    await expect(service.requireRole(team.id, memberId, ["admin"]))
      .rejects.toThrow(/permission/i);

    await db.extensionSkillRecord.delete({
      where: {
        projectId_id: {
          projectId: team.id,
          id: "kubernetes-expert",
        },
      },
    });
    expect(await db.extensionSkillRecord.findUnique({
      where: {
        projectId_id: {
          projectId: "individual",
          id: "kubernetes-expert",
        },
      },
    })).not.toBeNull();
  });

  it("accepts a pending invitation when the invited user first signs in", async () => {
    const db = createTestPrisma();
    const service = new ProjectService(db);
    const administrator = auth({
      displayName: "Administrator",
      email: "administrator@tasklattice.local",
      provider: "sso",
      username: "administrator",
    });
    const administratorId = await service.ensureUser(administrator);
    const team = await service.create(administrator, "SRE");
    await service.invite(
      team.id,
      administratorId,
      "new-user@example.com",
      "admin",
    );

    const invitedUser = auth({
      displayName: "New User",
      email: "new-user@example.com",
      provider: "sso",
      username: "new-user",
    });
    expect(await service.list(invitedUser)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: team.id, role: "admin" }),
    ]));
    expect(await db.projectInvitation.findFirst({
      where: { projectId: team.id, email: "new-user@example.com" },
    })).toMatchObject({ status: "accepted" });
  });

  it("prevents removing the last project administrator", async () => {
    const db = createTestPrisma();
    const service = new ProjectService(db);
    const administrator = auth({
      displayName: "Administrator",
      email: "administrator@tasklattice.local",
      provider: "sso",
      username: "administrator",
    });
    const administratorId = await service.ensureUser(administrator);
    const team = await service.create(administrator, "Security");

    await expect(
      service.removeMember(team.id, administratorId, administratorId),
    ).rejects.toThrow(/at least one administrator/i);
  });
});
