import { describe, expect, it } from "vitest";
import { DEFAULT_ACCESS_POLICY_ID } from "../access-policies/default-access-policy";
import { AuditLogService } from "../audit-logs/audit-log-service";
import type { AuthPayload, AuthUser } from "../auth/auth";
import {
  developmentControlConfig,
  setControlConfigForTests,
} from "../config/control-config";
import type {
  InvitationMailer,
  ProjectInvitationEmail,
} from "../email/smtp-invitation-mailer";
import type { LiteLLMAdminClient } from "../providers/litellm-client";
import { createTestPrisma } from "../test/prisma";
import { ProjectService } from "./project-service";

class RecordingInvitationMailer implements InvitationMailer {
  readonly invitations: ProjectInvitationEmail[] = [];

  constructor(
    private readonly configured = true,
    private readonly deliveryError?: Error,
  ) {}

  assertConfigured(): void {
    if (!this.configured) throw new Error("SMTP invitation delivery is not configured.");
  }

  async sendProjectInvitation(invitation: ProjectInvitationEmail): Promise<void> {
    if (this.deliveryError) throw this.deliveryError;
    this.invitations.push(invitation);
  }
}

function auth(
  input: Omit<AuthUser, "id" | "systemRole"> &
    Partial<Pick<AuthUser, "id" | "systemRole">>,
): AuthPayload {
  const user: AuthUser = {
    ...input,
    id:
      input.id ??
      (input.provider === "local" ? "local-admin" : `test-${input.username}`),
    systemRole:
      input.systemRole ??
      (input.provider === "local" ? "super_administrator" : "user"),
  };
  return {
    exp: Number.MAX_SAFE_INTEGER,
    iat: 0,
    iss: "tali",
    sub: user.id,
    user,
  };
}

describe("ProjectService", () => {
  it("creates the default project and copies SQL-seeded metadata into teams", async () => {
    const db = createTestPrisma();
    const service = new ProjectService(db);
    const local = auth({
      displayName: "Local Administrator",
      email: "admin@tali.local",
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

    const team = await service.create(local, "AI Platform", []);
    expect(team).toMatchObject({
      name: "AI Platform",
      role: "admin",
      type: "team",
    });
    expect(
      await db.skillRecord.count({
        where: { projectId: team.id },
      }),
    ).toBe(
      await db.skillRecord.count({
        where: { projectId: "individual" },
      }),
    );
    for (const projectId of ["individual", team.id]) {
      const policy = await db.accessPolicyRecord.findUnique({
        where: {
          projectId_id: { projectId, id: DEFAULT_ACCESS_POLICY_ID },
        },
      });
      expect(policy?.payload).toMatchObject({
        id: DEFAULT_ACCESS_POLICY_ID,
        name: "Default",
        status: "ACTIVE",
        serverRules: [],
        revision: 1,
        createdBy: "system:setup",
      });
      expect(
        await db.accessPolicyVersionRecord.count({
          where: { projectId, policyId: DEFAULT_ACCESS_POLICY_ID },
        }),
      ).toBe(1);
    }
  });

  it("initializes the personal Project quota idempotently under concurrent requests", async () => {
    const db = createTestPrisma();
    const service = new ProjectService(db);
    const local = auth({
      displayName: "Local Administrator",
      email: "admin@tali.local",
      provider: "local",
      username: "admin",
    });
    await db.projectQuotaRecord.deleteMany({
      where: { projectId: "individual" },
    });

    await Promise.all(
      Array.from({ length: 4 }, () => service.ensureUser(local)),
    );

    expect(
      await db.projectQuotaRecord.count({
        where: { projectId: "individual" },
      }),
    ).toBe(1);
  });

  it("initializes the default deny-all Access Policy idempotently", async () => {
    const db = createTestPrisma();
    const service = new ProjectService(db);
    const local = auth({
      displayName: "Local Administrator",
      email: "admin@tali.local",
      provider: "local",
      username: "admin",
    });
    await db.accessPolicyRecord.delete({
      where: {
        projectId_id: {
          projectId: "individual",
          id: DEFAULT_ACCESS_POLICY_ID,
        },
      },
    });

    await Promise.all(
      Array.from({ length: 4 }, () => service.ensureUser(local)),
    );

    const policies = await db.accessPolicyRecord.findMany({
      where: { projectId: "individual", id: DEFAULT_ACCESS_POLICY_ID },
    });
    expect(policies).toHaveLength(1);
    expect(policies[0]?.payload).toMatchObject({
      name: "Default",
      status: "ACTIVE",
      serverRules: [],
      createdBy: "system:setup",
    });
    expect(
      await db.accessPolicyVersionRecord.count({
        where: {
          projectId: "individual",
          policyId: DEFAULT_ACCESS_POLICY_ID,
        },
      }),
    ).toBe(1);
  });

  it("seeds a personal Project idempotently under concurrent requests", async () => {
    const db = createTestPrisma();
    const service = new ProjectService(db);
    const user = auth({
      displayName: "Concurrent SSO User",
      email: "concurrent-sso@example.com",
      provider: "sso",
      username: "concurrent-sso",
    });
    await service.syncAuthUser(user.user);
    const personalProject = (await service.list(user)).find(
      ({ type }) => type === "personal",
    )!;
    await Promise.all([
      db.skillRecord.deleteMany({
        where: { projectId: personalProject.id },
      }),
      db.mcpServerRecord.deleteMany({
        where: { projectId: personalProject.id },
      }),
      db.knowledgeSourceRecord.deleteMany({
        where: { projectId: personalProject.id },
      }),
      db.agentSpecializationRecord.deleteMany({
        where: { projectId: personalProject.id },
      }),
      db.sandboxPolicyRecord.deleteMany({
        where: { projectId: personalProject.id },
      }),
    ]);

    await Promise.all(
      Array.from({ length: 4 }, () => service.ensureUser(user)),
    );

    const [
      sourceSkills,
      personalSkills,
      sourceMcpServers,
      personalMcpServers,
      sourceKnowledgeSources,
      personalKnowledgeSources,
      sourceSpecializations,
      personalSpecializations,
      sourcePolicies,
      personalPolicies,
    ] = await Promise.all([
      db.skillRecord.count({ where: { projectId: "individual" } }),
      db.skillRecord.count({ where: { projectId: personalProject.id } }),
      db.mcpServerRecord.count({ where: { projectId: "individual" } }),
      db.mcpServerRecord.count({ where: { projectId: personalProject.id } }),
      db.knowledgeSourceRecord.count({ where: { projectId: "individual" } }),
      db.knowledgeSourceRecord.count({
        where: { projectId: personalProject.id },
      }),
      db.agentSpecializationRecord.count({
        where: { projectId: "individual" },
      }),
      db.agentSpecializationRecord.count({
        where: { projectId: personalProject.id },
      }),
      db.sandboxPolicyRecord.count({ where: { projectId: "individual" } }),
      db.sandboxPolicyRecord.count({
        where: { projectId: personalProject.id },
      }),
    ]);
    expect([
      personalSkills,
      personalMcpServers,
      personalKnowledgeSources,
      personalSpecializations,
      personalPolicies,
    ]).toEqual([
      sourceSkills,
      sourceMcpServers,
      sourceKnowledgeSources,
      sourceSpecializations,
      sourcePolicies,
    ]);
  });

  it("creates the initial member set and pending invitations with assigned roles", async () => {
    const db = createTestPrisma();
    const service = new ProjectService(db);
    const administrator = auth({
      displayName: "Administrator",
      email: "administrator@tali.local",
      provider: "sso",
      username: "administrator",
    });
    await service.syncAuthUser(administrator.user);
    await service.syncAuthUser({
      displayName: "Existing Member",
      email: "member@example.com",
      id: "test-existing-member",
      provider: "sso",
      systemRole: "user",
      username: "existing-member",
    });

    const team = await service.create(administrator, "Agent Operations", [
      { email: "member@example.com", role: "user" },
      { email: "future-admin@example.com", role: "admin" },
    ]);
    const administratorId = await service.ensureUser(administrator);

    expect(team).toMatchObject({
      memberCount: 2,
      name: "Agent Operations",
      role: "admin",
    });
    expect(await service.members(team.id, administratorId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: "administrator@tali.local",
          kind: "human",
          role: "admin",
          status: "active",
        }),
        expect.objectContaining({
          email: "member@example.com",
          role: "user",
          status: "active",
        }),
        expect.objectContaining({
          email: "future-admin@example.com",
          kind: "human",
          role: "admin",
          status: "invited",
        }),
      ]),
    );
    expect(await service.list(administrator)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: team.id,
          memberCount: 2,
        }),
      ]),
    );
  });

  it("redacts member and invitation identities for the Auditor role", async () => {
    const db = createTestPrisma();
    const service = new ProjectService(db);
    const administrator = auth({
      displayName: "Administrator Name",
      email: "administrator@example.com",
      provider: "sso",
      username: "identity-admin",
    });
    const auditor = auth({
      displayName: "Compliance Auditor",
      email: "auditor@example.com",
      provider: "sso",
      username: "compliance-auditor",
    });
    await service.syncAuthUser(administrator.user);
    await service.syncAuthUser(auditor.user);
    const administratorId = await service.ensureUser(administrator);
    const auditorId = await service.ensureUser(auditor);
    const team = await service.create(administrator, "Redacted Membership", []);
    await db.projectMember.create({
      data: { projectId: team.id, userId: auditorId, role: "auditor" },
    });
    await db.projectInvitation.create({
      data: {
        id: "invite-sensitive",
        projectId: team.id,
        email: "future.developer@example.com",
        role: "developer",
        invitedBy: administratorId,
      },
    });

    const result = await service.members(team.id, auditorId);
    expect(JSON.stringify(result)).not.toContain("Administrator Name");
    expect(JSON.stringify(result)).not.toContain("administrator@example.com");
    expect(JSON.stringify(result)).not.toContain("future.developer@example.com");
    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({
        email: "a***@example.com",
        name: expect.stringMatching(/^Project member [a-f0-9]{8}$/),
      }),
      expect.objectContaining({
        email: "f***@example.com",
        status: "invited",
      }),
    ]));
  });

  it("rejects duplicate invitations and inviting the creator", async () => {
    const db = createTestPrisma();
    const service = new ProjectService(db);
    const administrator = auth({
      displayName: "Administrator",
      email: "administrator@tali.local",
      provider: "sso",
      username: "administrator",
    });
    await service.syncAuthUser(administrator.user);

    await expect(
      service.create(administrator, "Duplicate Team", [
        { email: "member@example.com", role: "user" },
        { email: "MEMBER@example.com", role: "admin" },
      ]),
    ).rejects.toThrow(/unique/i);
    await expect(
      service.create(administrator, "Creator Team", [
        { email: "administrator@tali.local", role: "user" },
      ]),
    ).rejects.toThrow(/already included/i);
  });

  it("requires Project names to be unique and immutable", async () => {
    const db = createTestPrisma();
    const service = new ProjectService(db);
    const administrator = auth({
      displayName: "Administrator",
      email: "administrator@tali.local",
      provider: "sso",
      username: "administrator",
    });
    await service.syncAuthUser(administrator.user);

    const project = await service.create(
      administrator,
      "Security Research",
      [],
    );
    const administratorId = await service.ensureUser(administrator);

    await expect(
      service.create(administrator, "security research", []),
    ).rejects.toThrow(/already exists/i);
    await expect(
      service.rename(project.id, administratorId, "Renamed Security Research"),
    ).rejects.toThrow(/immutable/i);
  });

  it("soft deletes Projects while retaining their unique name and audit history", async () => {
    const db = createTestPrisma();
    const service = new ProjectService(db);
    const administrator = auth({
      displayName: "Administrator",
      email: "administrator@tali.local",
      provider: "sso",
      username: "administrator",
    });
    await service.syncAuthUser(administrator.user);
    const project = await service.create(administrator, "Retained Project", []);
    const administratorId = await service.ensureUser(administrator);
    await new AuditLogService(project.id, db).record({
      projectId: project.id,
      actor: {
        type: "user",
        id: administratorId,
        name: administrator.user.displayName,
      },
      authorization: { role: "admin", decision: "allowed" },
      action: "project.test",
      verb: "tested",
      object: { type: "Project", id: project.id, name: project.name },
      outcome: "success",
      summary: "Project audit retention test.",
      request: {
        id: "project-retention-test",
        method: "POST",
        route: "/project-retention-test",
        ipAddress: "127.0.0.1",
        userAgent: "vitest",
      },
    });

    await service.delete(project.id, administratorId);

    expect(
      await db.project.findUnique({ where: { id: project.id } }),
    ).toMatchObject({
      deletedAt: expect.any(Date),
      deletedBy: administratorId,
      name: "Retained Project",
    });
    expect(
      (await service.list(administrator)).map(({ id }) => id),
    ).not.toContain(project.id);
    expect(
      await db.auditLogRecord.count({ where: { projectId: project.id } }),
    ).toBe(1);
    await expect(
      service.create(administrator, "Retained Project", []),
    ).rejects.toThrow(/already exists/i);
    await expect(
      service.requireRole(project.id, administratorId, ["admin"]),
    ).rejects.toThrow(/permission/i);
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
    await service.syncAuthUser(alex.user);

    expect(await service.list(alex)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "alex",
          role: "admin",
          type: "personal",
          effectiveCapabilities: expect.arrayContaining([
            "CAP_PROJECT_SETTINGS_UPDATE",
            "CAP_AGENT_INSTANCE_CREATE",
            "CAP_AGENT_INSTANCE_DELETE",
          ]),
        }),
      ]),
    );

    const alexId = await service.ensureUser(alex);
    const [personalProject] = await service.list(alex);
    await expect(
      service.rename(personalProject!.id, alexId, "Renamed"),
    ).rejects.toThrow(/immutable/i);
  });

  it("enforces project roles and keeps records isolated by project", async () => {
    const db = createTestPrisma();
    const service = new ProjectService(db);
    const administrator = auth({
      displayName: "Administrator",
      email: "administrator@tali.local",
      provider: "sso",
      username: "administrator",
    });
    await service.syncAuthUser(administrator.user);
    const member = {
      displayName: "Member",
      email: "member@example.com",
      id: "test-member",
      provider: "sso" as const,
      systemRole: "user" as const,
      username: "project-user",
    };
    const administratorId = await service.ensureUser(administrator);
    const memberId = await service.syncAuthUser(member);
    const team = await service.create(administrator, "DevOps", []);

    await service.invite(team.id, administratorId, member.email, "user");
    await expect(
      service.requireRole(team.id, memberId, ["admin"]),
    ).rejects.toThrow(/permission/i);

    await db.skillRecord.delete({
      where: {
        projectId_id: {
          projectId: team.id,
          id: "kubernetes-expert",
        },
      },
    });
    expect(
      await db.skillRecord.findUnique({
        where: {
          projectId_id: {
            projectId: "individual",
            id: "kubernetes-expert",
          },
        },
      }),
    ).not.toBeNull();
  });

  it("accepts a pending invitation when the invited user first signs in", async () => {
    const db = createTestPrisma();
    const mailer = new RecordingInvitationMailer();
    const service = new ProjectService(db, undefined, mailer);
    const administrator = auth({
      displayName: "Administrator",
      email: "administrator@tali.local",
      provider: "sso",
      username: "administrator",
    });
    await service.syncAuthUser(administrator.user);
    const administratorId = await service.ensureUser(administrator);
    const team = await service.create(administrator, "SRE", []);
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
    await service.syncAuthUser(invitedUser.user);
    expect(await service.list(invitedUser)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: team.id, role: "admin" }),
      ]),
    );
    expect(
      await db.projectInvitation.findFirst({
        where: { projectId: team.id, email: "new-user@example.com" },
      }),
    ).toMatchObject({ status: "accepted" });
    expect(mailer.invitations).toEqual([
      expect.objectContaining({
        email: "new-user@example.com",
        projectName: "SRE",
        role: "admin",
      }),
    ]);
  });

  it("rejects an unknown-user invitation before persisting when SMTP is disabled", async () => {
    const db = createTestPrisma();
    const service = new ProjectService(
      db,
      undefined,
      new RecordingInvitationMailer(false),
    );
    const administrator = auth({
      displayName: "Administrator",
      email: "administrator@tali.local",
      provider: "sso",
      username: "administrator",
    });
    await service.syncAuthUser(administrator.user);
    const administratorId = await service.ensureUser(administrator);
    const team = await service.create(administrator, "Email disabled", []);

    await expect(
      service.invite(team.id, administratorId, "new-user@example.com", "user"),
    ).rejects.toThrow(/SMTP invitation delivery is not configured/i);
    expect(
      await db.projectInvitation.count({ where: { projectId: team.id } }),
    ).toBe(0);
  });

  it("keeps a pending invitation when SMTP delivery fails so it can be retried", async () => {
    const db = createTestPrisma();
    const service = new ProjectService(
      db,
      undefined,
      new RecordingInvitationMailer(
        true,
        new Error("SMTP delivery failed: connection refused"),
      ),
    );
    const administrator = auth({
      displayName: "Administrator",
      email: "administrator@tali.local",
      provider: "sso",
      username: "administrator",
    });
    await service.syncAuthUser(administrator.user);
    const administratorId = await service.ensureUser(administrator);
    const team = await service.create(administrator, "Retry delivery", []);

    await expect(
      service.invite(team.id, administratorId, "retry@example.com", "user"),
    ).rejects.toThrow(/Invitation saved.*SMTP delivery failed/i);
    expect(
      await db.projectInvitation.findUnique({
        where: {
          projectId_email: {
            projectId: team.id,
            email: "retry@example.com",
          },
        },
      }),
    ).toMatchObject({ status: "pending" });
  });

  it("prevents removing the last project administrator", async () => {
    const db = createTestPrisma();
    const service = new ProjectService(db);
    const administrator = auth({
      displayName: "Administrator",
      email: "administrator@tali.local",
      provider: "sso",
      username: "administrator",
    });
    await service.syncAuthUser(administrator.user);
    const administratorId = await service.ensureUser(administrator);
    const team = await service.create(administrator, "Security", []);

    await expect(
      service.removeMember(team.id, administratorId, administratorId),
    ).rejects.toThrow(/at least one administrator/i);
  });

  it("prevents changing the last project administrator to another role", async () => {
    const db = createTestPrisma();
    const service = new ProjectService(db);
    const administrator = auth({
      displayName: "Administrator",
      email: "administrator@tali.local",
      provider: "sso",
      username: "administrator",
    });
    await service.syncAuthUser(administrator.user);
    const administratorId = await service.ensureUser(administrator);
    const team = await service.create(administrator, "Role Safety", []);

    await expect(service.invite(
      team.id,
      administratorId,
      administrator.user.email,
      "developer",
    )).rejects.toThrow(/at least one administrator/i);
  });

  it("serializes concurrent administrator removals and retains one administrator", async () => {
    const db = createTestPrisma();
    const service = new ProjectService(db);
    const first = auth({
      displayName: "First Administrator",
      email: "first-admin@example.com",
      provider: "sso",
      username: "first-admin",
    });
    const second = auth({
      displayName: "Second Administrator",
      email: "second-admin@example.com",
      provider: "sso",
      username: "second-admin",
    });
    await service.syncAuthUser(first.user);
    await service.syncAuthUser(second.user);
    const firstId = await service.ensureUser(first);
    const secondId = await service.ensureUser(second);
    const team = await service.create(first, "Concurrent Admin Safety", []);
    await service.invite(team.id, firstId, second.user.email, "admin");

    const outcomes = await Promise.allSettled([
      service.removeMember(team.id, firstId, secondId),
      service.removeMember(team.id, secondId, firstId),
    ]);
    expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === "rejected")).toHaveLength(1);
    await expect(db.projectMember.count({
      where: { projectId: team.id, role: "admin" },
    })).resolves.toBe(1);
  });

  it("prevents removing a member who still owns Project Agent resources", async () => {
    const db = createTestPrisma();
    const service = new ProjectService(db);
    const administrator = auth({
      displayName: "Administrator",
      email: "administrator@tali.local",
      provider: "sso",
      username: "administrator",
    });
    await service.syncAuthUser(administrator.user);
    const administratorId = await service.ensureUser(administrator);
    const developer = {
      displayName: "Developer",
      email: "developer-owner@example.com",
      id: "developer-owner",
      provider: "sso" as const,
      systemRole: "user" as const,
      username: "developer-owner",
    };
    await service.syncAuthUser(developer);
    const team = await service.create(administrator, "Owned Resource Safety", []);
    await service.invite(team.id, administratorId, developer.email, "developer");
    const now = new Date().toISOString();
    await db.agentRecord.create({
      data: {
        projectId: team.id,
        id: "owned-agent",
        ownerUserId: developer.id,
        createdAt: new Date(now),
        payload: { id: "owned-agent" },
      },
    });

    await expect(
      service.removeMember(team.id, administratorId, developer.id),
    ).rejects.toThrow(/Transfer.*Agent Instance/i);
    await expect(db.projectMember.findUnique({
      where: {
        projectId_userId: { projectId: team.id, userId: developer.id },
      },
    })).resolves.not.toBeNull();
  });

  it("keeps membership active when external quota-team revocation fails", async () => {
    const config = developmentControlConfig();
    config.litellm.master_key = "test-master-key";
    setControlConfigForTests(config);
    try {
      const db = createTestPrisma();
      const litellm = {
        removeProjectTeamMember: async () => {
          throw new Error("LiteLLM is unavailable");
        },
      } as unknown as LiteLLMAdminClient;
      const service = new ProjectService(db, litellm);
      const administrator = auth({
        displayName: "Administrator",
        email: "revoke-admin@example.com",
        provider: "sso",
        username: "revoke-admin",
      });
      const member = auth({
        displayName: "Member",
        email: "revoke-member@example.com",
        provider: "sso",
        username: "revoke-member",
      });
      await service.syncAuthUser(administrator.user);
      await service.syncAuthUser(member.user);
      const administratorId = await service.ensureUser(administrator);
      const memberId = await service.ensureUser(member);
      const team = await service.create(administrator, "Revocation Safety", []);
      await db.projectMember.create({
        data: { projectId: team.id, userId: memberId, role: "user" },
      });
      await db.projectQuotaRecord.update({
        where: { projectId: team.id },
        data: { litellmTeamId: "team-revocation" },
      });

      await expect(
        service.removeMember(team.id, administratorId, memberId),
      ).rejects.toThrow("LiteLLM is unavailable");
      await expect(db.projectMember.findUnique({
        where: {
          projectId_userId: { projectId: team.id, userId: memberId },
        },
      })).resolves.not.toBeNull();
    } finally {
      setControlConfigForTests(developmentControlConfig());
    }
  });

  it("does not let the system Super Administrator bypass Project membership", async () => {
    const db = createTestPrisma();
    const service = new ProjectService(db);
    const owner = auth({
      displayName: "Project Owner",
      email: "owner@example.com",
      provider: "sso",
      username: "owner",
    });
    await service.syncAuthUser(owner.user);
    const team = await service.create(owner, "Restricted Project", []);
    const local = auth({
      displayName: "Local Administrator",
      email: "admin@tali.local",
      provider: "local",
      username: "admin",
    });

    expect(
      await db.projectMember.findUnique({
        where: {
          projectId_userId: {
            projectId: team.id,
            userId: "local-admin",
          },
        },
      }),
    ).toBeNull();
    expect(await service.list(local)).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: team.id })]),
    );
    await expect(
      service.rename(team.id, "local-admin", "Managed Globally"),
    ).rejects.toThrow(/permission/i);
  });
});
