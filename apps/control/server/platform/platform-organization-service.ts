import type { PlatformOrganizationView } from "@tali/contracts";
import { prisma } from "../db/prisma";
import type { PrismaClient } from "../generated/prisma/client";

export class PlatformOrganizationService {
  constructor(private readonly db: PrismaClient = prisma()) {}

  async get(): Promise<PlatformOrganizationView> {
    const departments = await this.db.department.findMany({
      include: {
        members: {
          include: { user: true },
          orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
        },
        projects: {
          where: { deletedAt: null },
          include: { _count: { select: { humanMembers: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
    });
    return {
      departments: departments.map((department) => ({
        id: department.id,
        name: department.name,
        description: department.description,
        status: department.status as "active" | "suspended",
        members: department.members.map((membership) => ({
          id: membership.userId,
          displayName: membership.user.displayName,
          email: membership.user.email,
          role: membership.role,
          status: membership.status as "active" | "suspended",
        })),
        projects: department.projects.map((project) => ({
          id: project.id,
          name: project.name,
          memberCount: project._count.humanMembers,
        })),
      })),
    };
  }
}
