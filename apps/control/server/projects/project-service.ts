import { createHash, randomUUID } from "node:crypto";
import type { ProjectMembershipRole } from "@tali/contracts";
import { ensureDefaultAccessPolicy } from "../access-policies/default-access-policy";
import type { AuthPayload, AuthUser } from "../auth/auth";
import { requireAuth } from "../auth/auth";
import { getControlConfig } from "../config/control-config";
import { prisma } from "../db/prisma";
import {
  SmtpInvitationMailer,
  type InvitationMailer,
} from "../email/smtp-invitation-mailer";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import {
  LiteLLMClient,
  type LiteLLMAdminClient,
} from "../providers/litellm-client";
import { ProjectQuotaService } from "../quotas/project-quota-service";
import { ProjectStore } from "./project-store";
import { developmentResourceCatalog } from "../catalog/development-resource-catalog";
import { BuiltInPolicyCatalogSource } from "../policies/policy-service";
import {
  accessForMembership,
  membershipAccessInclude,
  projectAccessForMember,
  type ProjectAccessView,
} from "./project-access";

export type ProjectRole = ProjectMembershipRole;

export interface ProjectView extends ProjectAccessView {
  id: string;
  name: string;
  avatar?: string;
  memberCount: number;
}

export interface HumanProjectMemberView {
  id: string;
  kind: "human";
  name: string;
  email: string;
  roles: readonly ProjectRole[];
  activeRole?: ProjectRole;
  status: "active" | "invited";
}

function invitationRoleView(role: ProjectRole): Pick<HumanProjectMemberView, "roles"> {
  return { roles: [role] };
}

export type ProjectMemberView = HumanProjectMemberView;

export interface InitialProjectInvitation {
  email: string;
  role: ProjectRole;
}

function slug(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "project"
  );
}

function auditorMemberView(member: ProjectMemberView): ProjectMemberView {
  const [localPart = "", domain = ""] = member.email.split("@", 2);
  const maskedEmail = domain
    ? `${localPart.slice(0, 1) || "*"}***@${domain}`
    : "[redacted]";
  const pseudonym = createHash("sha256")
    .update(member.id)
    .digest("hex")
    .slice(0, 8);
  return {
    ...member,
    name: `Project member ${pseudonym}`,
    email: maskedEmail,
  };
}

const administratorMutationLocks = new Map<string, Promise<void>>();
const administratorAdvisoryLockNamespace = 0x54414c49; // "TALI"

function administratorAdvisoryLockKey(projectId: string): number {
  return createHash("sha256").update(projectId).digest().readInt32BE(0);
}

async function withAdministratorMutationLock<T>(
  projectId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous =
    administratorMutationLocks.get(projectId) ?? Promise.resolve();
  const turn = previous.catch(() => undefined);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = turn.then(() => gate);
  administratorMutationLocks.set(projectId, tail);
  await turn;
  try {
    return await operation();
  } finally {
    release();
    if (administratorMutationLocks.get(projectId) === tail) {
      administratorMutationLocks.delete(projectId);
    }
  }
}

export class ProjectService {
  constructor(
    private readonly db: PrismaClient = prisma(),
    private readonly litellm: LiteLLMAdminClient = new LiteLLMClient(),
    private readonly invitationMailer: InvitationMailer = new SmtpInvitationMailer(),
  ) {}

  /**
   * Serialize administrator-set mutations. Locking the complete admin set in
   * a stable order prevents two concurrent removals/downgrades from both
   * observing a stale count and leaving a Project without an administrator.
   */
  private async lockAdministrators(
    transaction: Prisma.TransactionClient,
    projectId: string,
    actorId: string,
  ): Promise<void> {
    // The advisory lock is shared across Control replicas. The surrounding
    // in-process mutex also prevents local request races and gives pg-mem an
    // equivalent serialization primitive in unit tests.
    await transaction.$queryRawUnsafe(
      "SELECT pg_advisory_xact_lock($1::integer, $2::integer)",
      administratorAdvisoryLockNamespace,
      administratorAdvisoryLockKey(projectId),
    );
    await transaction.$queryRawUnsafe(
      `SELECT user_id
         FROM tasklattice.project_members
        WHERE project_id = $1 AND role = 'admin'
        ORDER BY user_id
        FOR UPDATE`,
      projectId,
    );
    await transaction.$queryRawUnsafe(
      `SELECT user_id
         FROM tasklattice.project_member_role_assignments
        WHERE project_id = $1 AND role = 'admin'
        ORDER BY user_id
        FOR UPDATE`,
      projectId,
    );
    const actor = await transaction.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: actorId } },
      include: membershipAccessInclude,
    });
    if (!actor || accessForMembership(actor).activeRole !== "admin") {
      throw new Error("You do not have permission to manage this project.");
    }
  }

  private async administratorCount(
    transaction: Prisma.TransactionClient,
    projectId: string,
  ): Promise<number> {
    const [permanent, assigned] = await Promise.all([
      transaction.projectMember.findMany({
        where: { projectId, role: "admin" },
        select: { userId: true },
      }),
      transaction.projectMemberRoleAssignment.findMany({
        where: { projectId, role: "admin" },
        select: { userId: true },
      }),
    ]);
    return new Set([
      ...permanent.map(({ userId }) => userId),
      ...assigned.map(({ userId }) => userId),
    ]).size;
  }

  private async acceptPendingInvitations(auth: AuthPayload): Promise<string> {
    const id = await this.requireUser(auth);
    const user = await this.db.user.findUniqueOrThrow({
      where: { id },
      select: { email: true },
    });
    const email = user.email.trim().toLowerCase();
    const invitations = await this.db.projectInvitation.findMany({
      where: {
        email,
        status: "pending",
        project: { deletedAt: null },
      },
    });
    for (const invitation of invitations) {
      await this.db.$transaction(async (transaction) => {
        await transaction.projectMember.upsert({
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
          update: {},
        });
        await transaction.projectMemberRoleAssignment.upsert({
          where: {
            projectId_userId_role: {
              projectId: invitation.projectId,
              userId: id,
              role: invitation.role,
            },
          },
          create: {
            projectId: invitation.projectId,
            userId: id,
            role: invitation.role,
          },
          update: {},
        });
        await transaction.projectInvitation.update({
          where: { id: invitation.id },
          data: { status: "accepted" },
        });
      });
      await this.syncProjectTeam(invitation.projectId);
    }
    return id;
  }

  async requireUser(auth: AuthPayload): Promise<string> {
    const user = await this.db.user.findUnique({
      where: { id: auth.sub },
      select: { id: true, status: true },
    });
    if (!user || user.status !== "active") {
      throw new Error(
        "The authenticated TaskLattice Relay user is unavailable.",
      );
    }
    return user.id;
  }

  async authenticate(
    request: Request,
  ): Promise<{ auth: AuthPayload; userId: string }> {
    const auth = requireAuth(request);
    return { auth, userId: await this.requireUser(auth) };
  }

  async list(auth: AuthPayload): Promise<ProjectView[]> {
    const currentUserId = await this.acceptPendingInvitations(auth);
    const memberships = await this.db.projectMember.findMany({
      where: {
        userId: currentUserId,
        project: { deletedAt: null },
      },
      include: {
        ...membershipAccessInclude,
        project: {
          include: {
            _count: {
              select: { humanMembers: true },
            },
          },
        },
      },
      orderBy: { joinedAt: "asc" },
    });
    return memberships.map((membership) => {
      const { project } = membership;
      return {
        id: project.id,
        name: project.name,
        ...(project.avatar ? { avatar: project.avatar } : {}),
        memberCount: project._count.humanMembers,
        ...accessForMembership(membership),
      };
    });
  }

  async resolve(
    request: Request,
  ): Promise<{
    auth: AuthPayload;
    userId: string;
    projectId: string;
    activeRole: ProjectRole;
  }> {
    const { auth, userId: currentUserId } = await this.authenticate(request);
    const match = new URL(request.url).pathname.match(
      /^\/api\/v1\/projects\/([^/]+)(?:\/|$)/,
    );
    if (!match)
      throw new Error("Project scope is required in the request path.");
    const projectId = decodeURIComponent(match[1]!);
    const membership = await this.db.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: currentUserId } },
      include: {
        project: { select: { deletedAt: true } },
        ...membershipAccessInclude,
      },
    });
    if (!membership || membership.project.deletedAt) {
      throw new Error("Project not found or access denied.");
    }
    const access = accessForMembership(membership);
    return {
      auth,
      userId: currentUserId,
      projectId,
      activeRole: access.activeRole,
    };
  }

  async create(
    auth: AuthPayload,
    name: string,
    invitations: InitialProjectInvitation[],
  ): Promise<ProjectView> {
    const currentUserId = await this.acceptPendingInvitations(auth);
    const projectName = name.trim();
    const duplicate = await this.db.project.findFirst({
      where: { name: { equals: projectName, mode: "insensitive" } },
      select: { id: true },
    });
    if (duplicate)
      throw new Error(`A Project named "${projectName}" already exists.`);
    const creator = await this.db.user.findUniqueOrThrow({
      where: { id: currentUserId },
      select: { email: true },
    });
    const normalizedInvitations = invitations.map((invitation) => ({
      email: invitation.email.trim().toLowerCase(),
      role: invitation.role,
    }));
    const invitationEmails = normalizedInvitations.map(({ email }) => email);
    if (new Set(invitationEmails).size !== invitationEmails.length) {
      throw new Error("Each invited email address must be unique.");
    }
    if (invitationEmails.includes(creator.email)) {
      throw new Error(
        "The Project creator is already included as an administrator.",
      );
    }

    const existingUsers = invitationEmails.length
      ? await this.db.user.findMany({
          where: { email: { in: invitationEmails } },
          select: { email: true, id: true },
        })
      : [];
    const existingUserByEmail = new Map(
      existingUsers.map((user) => [user.email, user]),
    );
    const id = `${slug(projectName)}-${randomUUID().slice(0, 8)}`;
    const project = await this.db.project.create({
      data: {
        id,
        name: projectName,
        createdBy: currentUserId,
        humanMembers: {
          create: [
            {
              userId: currentUserId,
              role: "admin",
              roleAssignments: {
                create: { role: "admin" },
              },
            },
            ...normalizedInvitations.flatMap((invitation) => {
              const user = existingUserByEmail.get(invitation.email);
              return user
                ? [{
                    userId: user.id,
                    role: invitation.role,
                    roleAssignments: {
                      create: { role: invitation.role },
                    },
                  }]
                : [];
            }),
          ],
        },
        invitations: {
          create: normalizedInvitations.flatMap((invitation) =>
            existingUserByEmail.has(invitation.email)
              ? []
              : [
                  {
                    id: `invite-${randomUUID()}`,
                    email: invitation.email,
                    role: invitation.role,
                    invitedBy: currentUserId,
                  },
                ],
          ),
        },
      },
    });
    await this.db.projectQuotaRecord.create({
      data: { projectId: project.id },
    });
    await ensureDefaultAccessPolicy(this.db, project.id);
    await this.seedProject(project.id);
    await this.syncProjectTeam(project.id);
    const access = accessForMembership({
      role: "admin",
      roleAssignments: [{ role: "admin" }],
    });
    return {
      id: project.id,
      name: project.name,
      memberCount: existingUsers.length + 1,
      ...access,
    };
  }

  private async seedProject(projectId: string): Promise<void> {
    const resources = [
      [this.db.skillRecord, developmentResourceCatalog.skills],
      [this.db.knowledgeSourceRecord, developmentResourceCatalog.knowledgeSources],
      [this.db.agentSpecializationRecord, developmentResourceCatalog.specializations],
    ] as const;
    for (const [delegate, records] of resources) {
      if (records.length) {
        await (delegate.createMany as Function)({
          data: records.map((record, sortOrder) => ({
            projectId,
            id: record.id,
            payload: JSON.parse(JSON.stringify(record)),
            sortOrder,
          })),
          skipDuplicates: true,
        });
      }
    }
    const policies = new BuiltInPolicyCatalogSource().load().policies;
    if (policies.length) {
      await this.db.sandboxPolicyRecord.createMany({
        data: policies.map((policy) => ({
          projectId,
          id: policy.id,
          payload: JSON.parse(JSON.stringify(policy)),
          createdAt: new Date(0),
        })),
        skipDuplicates: true,
      });
    }
  }

  async requireRole(
    projectId: string,
    currentUserId: string,
    roles: ProjectRole[],
  ): Promise<ProjectRole> {
    const membership = await this.db.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: currentUserId } },
      include: {
        project: { select: { deletedAt: true } },
        ...membershipAccessInclude,
      },
    });
    const access = membership ? accessForMembership(membership) : undefined;
    const matchedRole = access && roles.includes(access.activeRole)
      ? access.activeRole
      : undefined;
    if (
      !membership ||
      membership.project.deletedAt ||
      !matchedRole
    ) {
      throw new Error("You do not have permission to manage this project.");
    }
    return matchedRole;
  }

  async switchRole(
    projectId: string,
    currentUserId: string,
    role: ProjectRole,
  ): Promise<ProjectAccessView> {
    const membership = await this.db.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: currentUserId } },
      include: {
        project: { select: { deletedAt: true } },
        roleAssignments: { select: { role: true } },
      },
    });
    if (!membership || membership.project.deletedAt) {
      throw new Error("Project not found or access denied.");
    }
    const assignedRoles = new Set([
      membership.role,
      ...membership.roleAssignments.map((assignment) => assignment.role),
    ]);
    if (!assignedRoles.has(role)) {
      throw new Error("This Project role is not assigned to your Account.");
    }
    if (membership.role !== role) {
      await this.db.projectMember.update({
        where: { projectId_userId: { projectId, userId: currentUserId } },
        data: { role },
      });
    }
    return (await projectAccessForMember(this.db, projectId, currentUserId))!;
  }

  async rename(
    projectId: string,
    currentUserId: string,
    name: string,
  ): Promise<ProjectView> {
    await this.requireRole(projectId, currentUserId, ["admin"]);
    const existing = await this.db.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!existing) throw new Error("Project not found.");
    void name;
    throw new Error("Project names are immutable after creation.");
  }

  async delete(projectId: string, currentUserId: string): Promise<void> {
    await this.requireRole(projectId, currentUserId, ["admin"]);
    const project = await this.db.project.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new Error("Project not found.");
    const quota = await this.db.projectQuotaRecord.findUnique({
      where: { projectId },
    });
    if (quota?.litellmTeamId && getControlConfig().litellm.master_key) {
      await this.litellm
        .deleteProjectTeam?.(quota.litellmTeamId)
        .catch(() => undefined);
    }
    await this.db.project.update({
      where: { id: projectId },
      data: {
        deletedAt: new Date(),
        deletedBy: currentUserId,
      },
    });
  }

  async members(
    projectId: string,
    currentUserId: string,
  ): Promise<ProjectMemberView[]> {
    const viewerRole = await this.requireRole(projectId, currentUserId, [
      "admin",
      "auditor",
    ]);
    const [members, invitations] = await Promise.all([
      this.db.projectMember.findMany({
        where: { projectId },
        include: {
          user: true,
          ...membershipAccessInclude,
        },
        orderBy: { joinedAt: "asc" },
      }),
      this.db.projectInvitation.findMany({
        where: { projectId, status: "pending" },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    const result: ProjectMemberView[] = [
      ...members.map((membership) => {
        const access = accessForMembership(membership);
        return {
          id: membership.user.id,
          kind: "human" as const,
          name: membership.user.displayName,
          email: membership.user.email,
          roles: access.assignedRoles,
          activeRole: access.activeRole,
          status: "active" as const,
        };
      }),
      ...invitations.map((invite) => ({
        id: invite.id,
        kind: "human" as const,
        name: invite.email.split("@")[0] || invite.email,
        email: invite.email,
        ...invitationRoleView(invite.role as ProjectRole),
        status: "invited" as const,
      })),
    ];
    return viewerRole === "auditor"
      ? result.map(auditorMemberView)
      : result;
  }

  async invite(
    projectId: string,
    currentUserId: string,
    email: string,
    role: ProjectRole,
  ): Promise<HumanProjectMemberView> {
    await this.requireRole(projectId, currentUserId, ["admin"]);
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await this.db.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      const membership = await withAdministratorMutationLock(projectId, () =>
        this.db.$transaction(async (transaction) => {
          await this.lockAdministrators(transaction, projectId, currentUserId);
          await transaction.projectMember.upsert({
            where: { projectId_userId: { projectId, userId: existing.id } },
            create: {
              projectId,
              userId: existing.id,
              role,
            },
            update: {},
            include: membershipAccessInclude,
          });
          await transaction.projectMemberRoleAssignment.upsert({
            where: {
              projectId_userId_role: {
                projectId,
                userId: existing.id,
                role,
              },
            },
            create: {
              projectId,
              userId: existing.id,
              role,
            },
            update: {},
          });
          return transaction.projectMember.findUniqueOrThrow({
            where: { projectId_userId: { projectId, userId: existing.id } },
            include: membershipAccessInclude,
          });
        }),
      );
      await this.syncProjectTeam(projectId);
      const access = accessForMembership(membership);
      return {
        id: existing.id,
        kind: "human",
        name: existing.displayName,
        email: existing.email,
        roles: access.assignedRoles,
        activeRole: access.activeRole,
        status: "active",
      };
    }
    this.invitationMailer.assertConfigured();
    const [project, inviter] = await Promise.all([
      this.db.project.findUnique({
        where: { id: projectId },
        select: { name: true },
      }),
      this.db.user.findUnique({
        where: { id: currentUserId },
        select: { displayName: true, email: true },
      }),
    ]);
    if (!project) throw new Error("Project not found.");
    if (!inviter) throw new Error("Inviting user not found.");
    const invite = await withAdministratorMutationLock(projectId, () =>
      this.db.$transaction(async (transaction) => {
        await this.lockAdministrators(transaction, projectId, currentUserId);
        return transaction.projectInvitation.upsert({
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
      }),
    );
    try {
      await this.invitationMailer.sendProjectInvitation({
        email: normalizedEmail,
        inviterEmail: inviter.email,
        inviterName: inviter.displayName,
        projectName: project.name,
        role,
      });
    } catch (error) {
      throw new Error(
        `Invitation saved, but ${
          error instanceof Error
            ? error.message
            : "SMTP delivery failed with an unknown error."
        }`,
      );
    }
    return {
      id: invite.id,
      kind: "human",
      name: normalizedEmail.split("@")[0] || normalizedEmail,
      email: normalizedEmail,
      ...invitationRoleView(role),
      status: "invited",
    };
  }

  async removeMember(
    projectId: string,
    currentUserId: string,
    memberId: string,
  ): Promise<void> {
    await this.requireRole(projectId, currentUserId, ["admin"]);
    let externallyRevoked = false;
    try {
      const removedInvitation = await withAdministratorMutationLock(
        projectId,
        () =>
          this.db.$transaction(async (transaction) => {
          await this.lockAdministrators(transaction, projectId, currentUserId);
          const invitation = await transaction.projectInvitation.deleteMany({
            where: { projectId, id: memberId },
          });
          if (invitation.count) return true;
          const target = await transaction.projectMember.findUnique({
            where: { projectId_userId: { projectId, userId: memberId } },
            include: {
              roleAssignments: {
                select: { role: true },
              },
            },
          });
          if (!target) throw new Error("Project member not found.");
          const [ownedInstances, ownedRegisteredAgents] = await Promise.all([
            transaction.agentRecord.count({
              where: { projectId, ownerUserId: target.userId },
            }),
            transaction.agentCatalogRecord.count({
              where: { projectId, ownerUserId: target.userId },
            }),
          ]);
          if (ownedInstances || ownedRegisteredAgents) {
            throw new Error(
              `Transfer the member's ${ownedInstances} Agent Instance(s) and ${ownedRegisteredAgents} registered Agent(s) before removing them.`,
            );
          }
          if (
            target.role === "admin"
            || target.roleAssignments.some(({ role }) => role === "admin")
          ) {
            const adminCount = await this.administratorCount(
              transaction,
              projectId,
            );
            if (adminCount <= 1) {
              throw new Error(
                "A project must retain at least one administrator.",
              );
            }
          }
          const quota = await transaction.projectQuotaRecord.findUnique({
            where: { projectId },
            select: { litellmTeamId: true },
          });
          if (quota?.litellmTeamId && getControlConfig().litellm.master_key) {
            const revoke = this.litellm.removeProjectTeamMember;
            if (typeof revoke !== "function") {
              throw new Error(
                "LiteLLM member revocation is unavailable; the Project membership was not removed.",
              );
            }
            // Revoke the external quota-team access before committing the
            // authoritative membership deletion. A failed revocation leaves
            // the member in place instead of silently retaining external
            // access for an actor the UI says was removed.
            await revoke.call(this.litellm, quota.litellmTeamId, memberId);
            externallyRevoked = true;
          }
          await transaction.projectMember.delete({
            where: { projectId_userId: { projectId, userId: memberId } },
          });
          return false;
          }),
      );
      if (removedInvitation) return;
    } catch (error) {
      // If the external revoke succeeded but the database commit failed, make
      // a best-effort reconciliation while the membership still exists.
      if (externallyRevoked) await this.syncProjectTeam(projectId);
      throw error;
    }
  }

  private async syncProjectTeam(projectId: string): Promise<void> {
    if (!getControlConfig().litellm.master_key) return;
    await new ProjectQuotaService(
      new ProjectStore(projectId, this.db),
      this.litellm,
    )
      .sync()
      .catch(() => undefined);
  }

  async syncAuthUser(user: AuthUser): Promise<string> {
    await this.db.user.upsert({
      where: { id: user.id },
      create: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        systemRole: user.systemRole,
        status: "active",
        identities: {
          create: {
            id: `identity-${user.id}`,
            type: user.provider === "local" ? "local" : "oidc",
            issuer: user.provider === "local" ? "tali:local" : "test:sso",
            subject: user.username,
            username: user.username,
            email: user.email,
          },
        },
      },
      update: {
        displayName: user.displayName,
        email: user.email,
        systemRole: user.systemRole,
      },
    });
    return this.acceptPendingInvitations({
      exp: Number.MAX_SAFE_INTEGER,
      iat: 0,
      iss: "tali",
      sub: user.id,
      user,
    });
  }
}
