import { createHash, randomUUID } from "node:crypto";
import type { AuthPayload, AuthUser } from "../auth/auth";
import { requireAuth } from "../auth/auth";
import { prisma } from "../db/prisma";
import type { PrismaClient } from "../generated/prisma/client";

export type ProjectRole = "admin" | "member";
export type ProjectType = "personal" | "team";

export interface ProjectView {
  id: string;
  name: string;
  type: ProjectType;
  avatar?: string;
  memberCount: number;
  role: ProjectRole;
}

export interface ProjectMemberView {
  id: string;
  name: string;
  email: string;
  role: ProjectRole;
  status: "active" | "invited";
}

function personalProjectId(username: string): string {
  if (username === (process.env.TALI_AUTH_LOCAL_USERNAME ?? "admin")) {
    return process.env.TALI_BOOTSTRAP_PROJECT_ID ?? "individual";
  }
  return `individual-${createHash("sha256").update(username).digest("hex").slice(0, 12)}`;
}

function userId(username: string): string {
  if (username === (process.env.TALI_AUTH_LOCAL_USERNAME ?? "admin")) {
    return process.env.TALI_BOOTSTRAP_USER_ID ?? "local-admin";
  }
  return `user-${createHash("sha256").update(username).digest("hex").slice(0, 16)}`;
}

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "project";
}

export class ProjectService {
  constructor(private readonly db: PrismaClient = prisma()) {}

  async ensureUser(auth: AuthPayload): Promise<string> {
    const id = userId(auth.user.username);
    const email = (
      auth.user.email || `${auth.user.username}@tasklattice.local`
    ).trim().toLowerCase();
    await this.db.user.upsert({
      where: { id },
      create: {
        id,
        username: auth.user.username,
        email,
        displayName: auth.user.displayName,
        authProvider: auth.user.provider,
      },
      update: {
        email,
        displayName: auth.user.displayName,
        authProvider: auth.user.provider,
      },
    });
    const projectId = personalProjectId(auth.user.username);
    const personalProjectName = auth.user.username;
    await this.db.project.upsert({
      where: { id: projectId },
      create: {
        id: projectId,
        name: personalProjectName,
        type: "personal",
        createdBy: id,
        members: { create: { userId: id, role: "admin" } },
      },
      update: { name: personalProjectName },
    });
    await this.db.projectMember.upsert({
      where: { projectId_userId: { projectId, userId: id } },
      create: { projectId, userId: id, role: "admin" },
      update: { role: "admin" },
    });
    const invitations = await this.db.projectInvitation.findMany({
      where: { email, status: "pending" },
    });
    for (const invitation of invitations) {
      await this.db.$transaction([
        this.db.projectMember.upsert({
          where: {
            projectId_userId: {
              projectId: invitation.projectId,
              userId: id,
            },
          },
          create: {
            projectId: invitation.projectId,
            userId: id,
            role: invitation.role,
          },
          update: { role: invitation.role },
        }),
        this.db.projectInvitation.update({
          where: { id: invitation.id },
          data: { status: "accepted" },
        }),
      ]);
    }
    if (projectId !== (process.env.TALI_BOOTSTRAP_PROJECT_ID ?? "individual")) {
      const seeded = await this.db.extensionSkillRecord.count({ where: { projectId } });
      if (!seeded) await this.seedProject(projectId);
    }
    return id;
  }

  async authenticate(request: Request): Promise<{ auth: AuthPayload; userId: string }> {
    const auth = requireAuth(request);
    return { auth, userId: await this.ensureUser(auth) };
  }

  async list(auth: AuthPayload): Promise<ProjectView[]> {
    const currentUserId = await this.ensureUser(auth);
    const memberships = await this.db.projectMember.findMany({
      where: { userId: currentUserId },
      include: { project: { include: { _count: { select: { members: true } } } } },
      orderBy: { joinedAt: "asc" },
    });
    return memberships.map(({ project, role }) => ({
      id: project.id,
      name: project.name,
      type: project.type as ProjectType,
      ...(project.avatar ? { avatar: project.avatar } : {}),
      memberCount: project._count.members,
      role: role as ProjectRole,
    }));
  }

  async resolve(request: Request): Promise<{ auth: AuthPayload; userId: string; projectId: string; role: ProjectRole }> {
    const { auth, userId: currentUserId } = await this.authenticate(request);
    const match = new URL(request.url).pathname.match(
      /^\/api\/v1\/projects\/([^/]+)(?:\/|$)/,
    );
    if (!match) throw new Error("Project scope is required in the request path.");
    const projectId = decodeURIComponent(match[1]!);
    const membership = await this.db.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: currentUserId } },
    });
    if (!membership) throw new Error("Project not found or access denied.");
    return { auth, userId: currentUserId, projectId, role: membership.role as ProjectRole };
  }

  async create(auth: AuthPayload, name: string): Promise<ProjectView> {
    const currentUserId = await this.ensureUser(auth);
    const id = `${slug(name)}-${randomUUID().slice(0, 8)}`;
    const project = await this.db.project.create({
      data: {
        id,
        name: name.trim(),
        type: "team",
        createdBy: currentUserId,
        members: { create: { userId: currentUserId, role: "admin" } },
      },
    });
    await this.seedProject(project.id);
    return { id: project.id, name: project.name, type: "team", memberCount: 1, role: "admin" };
  }

  private async seedProject(projectId: string): Promise<void> {
    const sourceProjectId = process.env.TALI_BOOTSTRAP_PROJECT_ID ?? "individual";
    const delegates = [
      this.db.extensionSkillRecord,
      this.db.extensionMcpServerRecord,
      this.db.extensionKnowledgeSourceRecord,
      this.db.agentSpecializationRecord,
    ] as const;
    for (const delegate of delegates) {
      const records = await (delegate.findMany as Function)({
        where: { projectId: sourceProjectId },
      }) as Array<{ id: string; payload: unknown; sortOrder: number }>;
      for (const record of records) {
        await (delegate.upsert as Function)({
          where: { projectId_id: { projectId, id: record.id } },
          create: {
            projectId,
            id: record.id,
            payload: record.payload,
            sortOrder: record.sortOrder,
          },
          update: {},
        });
      }
    }
    const policies = await this.db.sandboxPolicyRecord.findMany({
      where: { projectId: sourceProjectId },
    });
    for (const policy of policies) {
      await this.db.sandboxPolicyRecord.upsert({
        where: { projectId_id: { projectId, id: policy.id } },
        create: {
          projectId,
          id: policy.id,
          payload: JSON.parse(JSON.stringify(policy.payload)),
          createdAt: policy.createdAt,
        },
        update: {},
      });
    }
  }

  async requireRole(projectId: string, currentUserId: string, roles: ProjectRole[]): Promise<ProjectRole> {
    const membership = await this.db.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: currentUserId } },
    });
    if (!membership || !roles.includes(membership.role as ProjectRole)) {
      throw new Error("You do not have permission to manage this project.");
    }
    return membership.role as ProjectRole;
  }

  async rename(projectId: string, currentUserId: string, name: string): Promise<ProjectView> {
    const role = await this.requireRole(projectId, currentUserId, ["admin"]);
    const existing = await this.db.project.findUnique({
      where: { id: projectId },
      select: { type: true },
    });
    if (!existing) throw new Error("Project not found.");
    if (existing.type === "personal") {
      throw new Error("A personal Project name always matches its username.");
    }
    const project = await this.db.project.update({
      where: { id: projectId },
      data: { name: name.trim() },
      include: { _count: { select: { members: true } } },
    });
    return {
      id: project.id,
      name: project.name,
      type: project.type as ProjectType,
      ...(project.avatar ? { avatar: project.avatar } : {}),
      memberCount: project._count.members,
      role,
    };
  }

  async delete(projectId: string, currentUserId: string): Promise<void> {
    await this.requireRole(projectId, currentUserId, ["admin"]);
    const project = await this.db.project.findUnique({ where: { id: projectId } });
    if (!project) throw new Error("Project not found.");
    if (project.type === "personal") throw new Error("The default project cannot be deleted.");
    await this.db.project.delete({ where: { id: projectId } });
  }

  async members(projectId: string, currentUserId: string): Promise<ProjectMemberView[]> {
    await this.requireRole(projectId, currentUserId, ["admin", "member"]);
    const [members, invitations] = await Promise.all([
      this.db.projectMember.findMany({
        where: { projectId },
        include: { user: true },
        orderBy: { joinedAt: "asc" },
      }),
      this.db.projectInvitation.findMany({
        where: { projectId, status: "pending" },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    return [
      ...members.map(({ user, role }) => ({
        id: user.id,
        name: user.displayName,
        email: user.email,
        role: role as ProjectRole,
        status: "active" as const,
      })),
      ...invitations.map((invite) => ({
        id: invite.id,
        name: invite.email.split("@")[0] || invite.email,
        email: invite.email,
        role: invite.role as ProjectRole,
        status: "invited" as const,
      })),
    ];
  }

  async invite(
    projectId: string,
    currentUserId: string,
    email: string,
    role: ProjectRole,
  ): Promise<ProjectMemberView> {
    await this.requireRole(projectId, currentUserId, ["admin"]);
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await this.db.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      const membership = await this.db.projectMember.upsert({
        where: { projectId_userId: { projectId, userId: existing.id } },
        create: { projectId, userId: existing.id, role },
        update: { role },
      });
      return {
        id: existing.id,
        name: existing.displayName,
        email: existing.email,
        role: membership.role as ProjectRole,
        status: "active",
      };
    }
    const invite = await this.db.projectInvitation.upsert({
      where: { projectId_email: { projectId, email: normalizedEmail } },
      create: {
        id: `invite-${randomUUID()}`,
        projectId,
        email: normalizedEmail,
        role,
        invitedBy: currentUserId,
      },
      update: { role, status: "pending", invitedBy: currentUserId },
    });
    return {
      id: invite.id,
      name: normalizedEmail.split("@")[0] || normalizedEmail,
      email: normalizedEmail,
      role,
      status: "invited",
    };
  }

  async removeMember(projectId: string, currentUserId: string, memberId: string): Promise<void> {
    await this.requireRole(projectId, currentUserId, ["admin"]);
    const invitation = await this.db.projectInvitation.deleteMany({
      where: { projectId, id: memberId },
    });
    if (invitation.count) return;
    const target = await this.db.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: memberId } },
    });
    if (!target) throw new Error("Project member not found.");
    if (target.role === "admin") {
      const adminCount = await this.db.projectMember.count({
        where: { projectId, role: "admin" },
      });
      if (adminCount <= 1) {
        throw new Error("A project must retain at least one administrator.");
      }
    }
    await this.db.projectMember.delete({
      where: { projectId_userId: { projectId, userId: memberId } },
    });
  }

  async syncAuthUser(user: AuthUser): Promise<string> {
    return this.ensureUser({
      exp: Number.MAX_SAFE_INTEGER,
      iat: 0,
      iss: "tasklattice",
      sub: user.username,
      user,
    });
  }
}
