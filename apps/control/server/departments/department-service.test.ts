import { describe, expect, it } from "vitest";
import type { PlatformPrincipal, AuthUser } from "../auth/auth";
import { createTestPrisma } from "../test/prisma";
import { DepartmentService } from "./department-service";

function auth(user: AuthUser): PlatformPrincipal {
  return { user };
}

const administrator = auth({
  id: "local-admin",
  displayName: "Local Administrator",
  email: "admin@tali.local",
  hasPassword: true,
  systemRole: "platform_administrator",
  username: "admin",
});

describe("DepartmentService", () => {
  it("returns the default Department with its independent roles", async () => {
    const service = new DepartmentService(createTestPrisma());

    await expect(service.get(administrator, "dep1")).resolves.toMatchObject({
      id: "dep1",
      name: "dep1",
      memberCount: 1,
      projectCount: 1,
      role: "administrator",
      members: [
        {
          id: "local-admin",
          displayName: "Local Administrator",
          role: "administrator",
          status: "active",
          projects: [
            {
              id: "individual",
              roles: ["admin", "developer"],
            },
          ],
        },
      ],
      projects: [
        {
          memberCount: 1,
          instanceCount: 0,
          mcpIntegrationCount: 0,
          knowledgeBaseCount: 0,
          modelCount: 0,
          routingCount: 0,
        },
      ],
    });
  });

  it("allows a Department Administrator without a system role", async () => {
    const database = createTestPrisma();
    await database.user.create({
      data: {
        id: "department-admin",
        username: "department-admin",
        email: "department-admin@example.com",
        displayName: "Department Administrator",
        systemRole: "user",
      },
    });
    await database.departmentMember.create({
      data: {
        departmentId: "dep1",
        userId: "department-admin",
        role: "administrator",
      },
    });
    const departmentAdministrator = auth({
      id: "department-admin",
      displayName: "Department Administrator",
      email: "department-admin@example.com",
      hasPassword: false,
      systemRole: "user",
      username: "department-admin",
    });

    await expect(
      new DepartmentService(database).get(departmentAdministrator, "dep1"),
    ).resolves.toMatchObject({ id: "dep1", role: "administrator" });
  });

  it("does not let a Platform Administrator bypass the Department role", async () => {
    const database = createTestPrisma();
    await database.user.create({
      data: {
        id: "system-admin",
        username: "system-admin",
        email: "system-admin@example.com",
        displayName: "System Administrator",
        systemRole: "platform_administrator",
      },
    });
    await database.departmentMember.create({
      data: { departmentId: "dep1", userId: "system-admin", role: "member" },
    });
    const systemAdministrator = auth({
      id: "system-admin",
      displayName: "System Administrator",
      email: "system-admin@example.com",
      hasPassword: false,
      systemRole: "platform_administrator",
      username: "system-admin",
    });

    const service = new DepartmentService(database);
    await expect(service.get(systemAdministrator, "dep1")).rejects.toThrow(
      "permission to administer this Department",
    );
    await expect(service.list(systemAdministrator)).resolves.toEqual([]);
  });

  it("does not lower the Department ceiling below existing Project allocations", async () => {
    const database = createTestPrisma();
    await database.projectQuotaRecord.update({
      where: { projectId: "individual" },
      data: {
        hardBudgetUsd: 75,
        budgetDuration: "30d",
        budgetPeriodStartedAt: new Date("2026-08-01T00:00:00.000Z"),
        budgetResetsAt: new Date("2026-08-31T00:00:00.000Z"),
      },
    });
    const service = new DepartmentService(database);

    await expect(
      service.update(administrator, "dep1", {
        name: "dep1",
        description: "Organizational budget owner",
        hardBudgetUsd: 50,
      }),
    ).rejects.toThrow("already allocated");

    await expect(
      service.update(administrator, "dep1", {
        name: "dep1",
        description: "Organizational budget owner",
        hardBudgetUsd: 100,
      }),
    ).resolves.toMatchObject({
      allocatedBudgetUsd: 75,
      hardBudgetUsd: 100,
    });
  });

  it("turns unallocated Projects into zero-dollar allocations when adding a ceiling", async () => {
    const database = createTestPrisma();
    const service = new DepartmentService(database);

    await expect(
      service.update(administrator, "dep1", {
        name: "dep1",
        description: null,
        hardBudgetUsd: 100,
      }),
    ).resolves.toMatchObject({
      hardBudgetUsd: 100,
      projects: [{ hardBudgetUsd: 0 }],
    });
    const quota = await database.projectQuotaRecord.findUniqueOrThrow({
      where: { projectId: "individual" },
    });
    expect(Number(quota.hardBudgetUsd)).toBe(0);
    expect(quota.budgetDuration).toBe("30d");
  });
});
