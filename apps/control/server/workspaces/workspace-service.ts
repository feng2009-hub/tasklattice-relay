import { createHash, randomUUID } from "node:crypto";
import type { AuthPayload, AuthUser } from "../auth/auth";
import { requireAuth } from "../auth/auth";
import { prisma } from "../db/prisma";
import type { PrismaClient } from "../generated/prisma/client";

export type WorkspaceRole = "owner" | "admin" | "member";
export type WorkspaceType = "personal" | "team";

export interface WorkspaceView {
  id: string;
  name: string;
  type: WorkspaceType;
  avatar?: string;
  memberCount: number;
  role: WorkspaceRole;
}

export interface WorkspaceMemberView {
  id: string;
  name: string;
  email: string;
  role: WorkspaceRole;
  status: "active" | "invited";
}

function personalWorkspaceId(username: string): string {
  if (username === (process.env.TALI_AUTH_LOCAL_USERNAME ?? "admin")) {
    return process.env.TALI_BOOTSTRAP_WORKSPACE_ID ?? "individual";
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
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "workspace";
}

export class WorkspaceService {
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
    const workspaceId = personalWorkspaceId(auth.user.username);
    await this.db.workspace.upsert({
      where: { id: workspaceId },
      create: {
        id: workspaceId,
        name: "Individual",
        type: "personal",
        createdBy: id,
        members: { create: { userId: id, role: "owner" } },
      },
      update: {},
    });
    await this.db.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId, userId: id } },
      create: { workspaceId, userId: id, role: "owner" },
      update: { role: "owner" },
    });
    const invitations = await this.db.workspaceInvitation.findMany({
      where: { email, status: "pending" },
    });
    for (const invitation of invitations) {
      await this.db.$transaction([
        this.db.workspaceMember.upsert({
          where: {
            workspaceId_userId: {
              workspaceId: invitation.workspaceId,
              userId: id,
            },
          },
          create: {
            workspaceId: invitation.workspaceId,
            userId: id,
            role: invitation.role,
          },
          update: { role: invitation.role },
        }),
        this.db.workspaceInvitation.update({
          where: { id: invitation.id },
          data: { status: "accepted" },
        }),
      ]);
    }
    if (workspaceId !== (process.env.TALI_BOOTSTRAP_WORKSPACE_ID ?? "individual")) {
      const seeded = await this.db.extensionSkillRecord.count({ where: { workspaceId } });
      if (!seeded) await this.seedWorkspace(workspaceId);
    }
    return id;
  }

  async authenticate(request: Request): Promise<{ auth: AuthPayload; userId: string }> {
    const auth = requireAuth(request);
    return { auth, userId: await this.ensureUser(auth) };
  }

  async list(auth: AuthPayload): Promise<WorkspaceView[]> {
    const currentUserId = await this.ensureUser(auth);
    const memberships = await this.db.workspaceMember.findMany({
      where: { userId: currentUserId },
      include: { workspace: { include: { _count: { select: { members: true } } } } },
      orderBy: { joinedAt: "asc" },
    });
    return memberships.map(({ workspace, role }) => ({
      id: workspace.id,
      name: workspace.name,
      type: workspace.type as WorkspaceType,
      ...(workspace.avatar ? { avatar: workspace.avatar } : {}),
      memberCount: workspace._count.members,
      role: role as WorkspaceRole,
    }));
  }

  async resolve(request: Request): Promise<{ auth: AuthPayload; userId: string; workspaceId: string; role: WorkspaceRole }> {
    const { auth, userId: currentUserId } = await this.authenticate(request);
    const requested = request.headers.get("x-workspace-id")?.trim();
    const workspaceId = requested || personalWorkspaceId(auth.user.username);
    const membership = await this.db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: currentUserId } },
    });
    if (!membership) throw new Error("Workspace not found or access denied.");
    return { auth, userId: currentUserId, workspaceId, role: membership.role as WorkspaceRole };
  }

  async create(auth: AuthPayload, name: string): Promise<WorkspaceView> {
    const currentUserId = await this.ensureUser(auth);
    const id = `${slug(name)}-${randomUUID().slice(0, 8)}`;
    const workspace = await this.db.workspace.create({
      data: {
        id,
        name: name.trim(),
        type: "team",
        createdBy: currentUserId,
        members: { create: { userId: currentUserId, role: "owner" } },
      },
    });
    await this.seedWorkspace(workspace.id);
    return { id: workspace.id, name: workspace.name, type: "team", memberCount: 1, role: "owner" };
  }

  private async seedWorkspace(workspaceId: string): Promise<void> {
    const sourceWorkspaceId = process.env.TALI_BOOTSTRAP_WORKSPACE_ID ?? "individual";
    const delegates = [
      this.db.extensionSkillRecord,
      this.db.extensionMcpServerRecord,
      this.db.extensionKnowledgeSourceRecord,
      this.db.agentSpecializationRecord,
    ] as const;
    for (const delegate of delegates) {
      const records = await (delegate.findMany as Function)({
        where: { workspaceId: sourceWorkspaceId },
      }) as Array<{ id: string; payload: unknown; sortOrder: number }>;
      for (const record of records) {
        await (delegate.upsert as Function)({
          where: { workspaceId_id: { workspaceId, id: record.id } },
          create: {
            workspaceId,
            id: record.id,
            payload: record.payload,
            sortOrder: record.sortOrder,
          },
          update: {},
        });
      }
    }
    const policies = await this.db.sandboxPolicyRecord.findMany({
      where: { workspaceId: sourceWorkspaceId },
    });
    for (const policy of policies) {
      await this.db.sandboxPolicyRecord.upsert({
        where: { workspaceId_id: { workspaceId, id: policy.id } },
        create: {
          workspaceId,
          id: policy.id,
          payload: JSON.parse(JSON.stringify(policy.payload)),
          createdAt: policy.createdAt,
        },
        update: {},
      });
    }
  }

  async requireRole(workspaceId: string, currentUserId: string, roles: WorkspaceRole[]): Promise<WorkspaceRole> {
    const membership = await this.db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: currentUserId } },
    });
    if (!membership || !roles.includes(membership.role as WorkspaceRole)) {
      throw new Error("You do not have permission to manage this workspace.");
    }
    return membership.role as WorkspaceRole;
  }

  async rename(workspaceId: string, currentUserId: string, name: string): Promise<WorkspaceView> {
    const role = await this.requireRole(workspaceId, currentUserId, ["owner", "admin"]);
    const workspace = await this.db.workspace.update({
      where: { id: workspaceId },
      data: { name: name.trim() },
      include: { _count: { select: { members: true } } },
    });
    return {
      id: workspace.id,
      name: workspace.name,
      type: workspace.type as WorkspaceType,
      ...(workspace.avatar ? { avatar: workspace.avatar } : {}),
      memberCount: workspace._count.members,
      role,
    };
  }

  async delete(workspaceId: string, currentUserId: string): Promise<void> {
    await this.requireRole(workspaceId, currentUserId, ["owner"]);
    const workspace = await this.db.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) throw new Error("Workspace not found.");
    if (workspace.type === "personal") throw new Error("The personal workspace cannot be deleted.");
    await this.db.workspace.delete({ where: { id: workspaceId } });
  }

  async members(workspaceId: string, currentUserId: string): Promise<WorkspaceMemberView[]> {
    await this.requireRole(workspaceId, currentUserId, ["owner", "admin", "member"]);
    const [members, invitations] = await Promise.all([
      this.db.workspaceMember.findMany({
        where: { workspaceId },
        include: { user: true },
        orderBy: { joinedAt: "asc" },
      }),
      this.db.workspaceInvitation.findMany({
        where: { workspaceId, status: "pending" },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    return [
      ...members.map(({ user, role }) => ({
        id: user.id,
        name: user.displayName,
        email: user.email,
        role: role as WorkspaceRole,
        status: "active" as const,
      })),
      ...invitations.map((invite) => ({
        id: invite.id,
        name: invite.email.split("@")[0] || invite.email,
        email: invite.email,
        role: invite.role as WorkspaceRole,
        status: "invited" as const,
      })),
    ];
  }

  async invite(
    workspaceId: string,
    currentUserId: string,
    email: string,
    role: Exclude<WorkspaceRole, "owner">,
  ): Promise<WorkspaceMemberView> {
    await this.requireRole(workspaceId, currentUserId, ["owner", "admin"]);
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await this.db.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      const membership = await this.db.workspaceMember.upsert({
        where: { workspaceId_userId: { workspaceId, userId: existing.id } },
        create: { workspaceId, userId: existing.id, role },
        update: { role },
      });
      return {
        id: existing.id,
        name: existing.displayName,
        email: existing.email,
        role: membership.role as WorkspaceRole,
        status: "active",
      };
    }
    const invite = await this.db.workspaceInvitation.upsert({
      where: { workspaceId_email: { workspaceId, email: normalizedEmail } },
      create: {
        id: `invite-${randomUUID()}`,
        workspaceId,
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

  async removeMember(workspaceId: string, currentUserId: string, memberId: string): Promise<void> {
    await this.requireRole(workspaceId, currentUserId, ["owner", "admin"]);
    const invitation = await this.db.workspaceInvitation.deleteMany({
      where: { workspaceId, id: memberId },
    });
    if (invitation.count) return;
    const target = await this.db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: memberId } },
    });
    if (!target) throw new Error("Workspace member not found.");
    if (target.role === "owner") throw new Error("The workspace owner cannot be removed.");
    await this.db.workspaceMember.delete({
      where: { workspaceId_userId: { workspaceId, userId: memberId } },
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
