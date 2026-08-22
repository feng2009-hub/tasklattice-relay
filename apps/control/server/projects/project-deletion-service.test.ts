import { describe, expect, it, vi } from "vitest";
import type { LiteLLMAdminClient } from "../providers/litellm-client";
import type { RunnerClient } from "../runtime/nemoclaw-runner-client";
import { createTestPrisma } from "../test/prisma";
import {
  PROJECT_DELETION_GRACE_PERIOD_MS,
  ProjectDeletionService,
  type ProjectRuntimeTargetCleanup,
} from "./project-deletion-service";

function deletionDependencies() {
  const destroySandbox = vi.fn(async () => ({ phase: "NOT_FOUND" }));
  const revokeKey = vi.fn(async () => undefined);
  const deleteProjectTeam = vi.fn(async () => undefined);
  return {
    deleteProjectTeam,
    destroySandbox,
    litellm: {
      baseUrl: "http://litellm.test",
      deleteProjectTeam,
      revokeKey,
    } as unknown as LiteLLMAdminClient,
    revokeKey,
    runner: { destroySandbox } as unknown as RunnerClient,
  };
}

describe("ProjectDeletionService", () => {
  it("leases due work before cascading Project cleanup", async () => {
    const db = createTestPrisma();
    const dependencies = deletionDependencies();
    const requestedAt = new Date("2026-08-15T08:00:00.000Z");
    await db.project.update({
      where: { id: "individual" },
      data: { deletedAt: requestedAt, deletedBy: "local-admin" },
    });
    const scheduledFor = new Date(
      requestedAt.getTime() + PROJECT_DELETION_GRACE_PERIOD_MS,
    );
    await db.projectDeletionTask.create({
      data: {
        projectId: "individual",
        nextAttemptAt: scheduledFor,
        scheduledFor,
      },
    });
    await db.agentRecord.create({
      data: {
        projectId: "individual",
        id: "cleanup-agent",
        ownerUserId: "local-admin",
        createdAt: requestedAt,
        payload: {
          agentPlatform: "openclaw",
          id: "cleanup-agent",
          liteLLMTokenId: "instance-key-1",
          name: "Cleanup Agent",
          sandboxName: "tali-cleanup-agent",
          status: "READY",
        },
      },
    });
    await db.projectQuotaRecord.update({
      where: { projectId: "individual" },
      data: { litellmTeamId: "project-team-1" },
    });
    const deleteProjectNamespace = vi.fn(async () => true);
    const service = new ProjectDeletionService(
      db,
      dependencies.runner,
      dependencies.litellm,
      { externalCleanupEnabled: true },
      {
        deleteProjectNamespace,
      } satisfies ProjectRuntimeTargetCleanup,
    );

    const early = await service.processNext(
      "worker-a",
      new Date(requestedAt.getTime() + PROJECT_DELETION_GRACE_PERIOD_MS - 1),
    );
    expect(early).toEqual({ status: "idle" });
    expect(dependencies.destroySandbox).not.toHaveBeenCalled();
    await expect(db.project.findUnique({ where: { id: "individual" } }))
      .resolves.not.toBeNull();

    const claim = await service.claimNext(
      "worker-a",
      new Date(requestedAt.getTime() + PROJECT_DELETION_GRACE_PERIOD_MS),
    );
    expect(claim).toMatchObject({
      attempts: 1,
      projectId: "individual",
      workerId: "worker-a",
    });
    await expect(service.claimNext(
      "worker-b",
      new Date(requestedAt.getTime() + PROJECT_DELETION_GRACE_PERIOD_MS),
    )).resolves.toBeUndefined();
    await db.projectDeletionTask.update({
      where: { projectId: "individual" },
      data: {
        attempts: 0,
        leaseExpiresAt: null,
        leaseOwner: null,
        status: "scheduled",
      },
    });
    const result = await service.processNext(
      "worker-a",
      new Date(requestedAt.getTime() + PROJECT_DELETION_GRACE_PERIOD_MS),
    );
    expect(result).toEqual({
      projectId: "individual",
      status: "completed",
    });
    expect(dependencies.destroySandbox).toHaveBeenCalledWith(
      "tali-cleanup-agent",
      "openclaw",
    );
    expect(dependencies.revokeKey).toHaveBeenCalledWith("instance-key-1");
    expect(dependencies.deleteProjectTeam).toHaveBeenCalledWith("project-team-1");
    expect(deleteProjectNamespace).toHaveBeenCalledWith("individual");
    await expect(db.project.findUnique({ where: { id: "individual" } }))
      .resolves.toBeNull();
    await expect(db.agentRecord.count({ where: { projectId: "individual" } }))
      .resolves.toBe(0);
  });

  it("keeps the tombstone for retry when external cleanup fails", async () => {
    const db = createTestPrisma();
    const requestedAt = new Date("2026-08-15T08:00:00.000Z");
    await db.project.update({
      where: { id: "individual" },
      data: { deletedAt: requestedAt, deletedBy: "local-admin" },
    });
    const scheduledFor = new Date(
      requestedAt.getTime() + PROJECT_DELETION_GRACE_PERIOD_MS,
    );
    await db.projectDeletionTask.create({
      data: {
        projectId: "individual",
        nextAttemptAt: scheduledFor,
        scheduledFor,
      },
    });
    await db.agentRecord.create({
      data: {
        projectId: "individual",
        id: "retry-agent",
        ownerUserId: "local-admin",
        createdAt: requestedAt,
        payload: {
          agentPlatform: "openclaw",
          id: "retry-agent",
          name: "Retry Agent",
          sandboxName: "tali-retry-agent",
          status: "READY",
        },
      },
    });
    const runner = {
      destroySandbox: vi.fn(async () => {
        throw new Error("Runner unavailable");
      }),
    } as unknown as RunnerClient;
    const service = new ProjectDeletionService(
      db,
      runner,
      deletionDependencies().litellm,
      { externalCleanupEnabled: false },
    );

    const result = await service.processNext(
      "retry-worker",
      new Date(requestedAt.getTime() + PROJECT_DELETION_GRACE_PERIOD_MS),
    );
    expect(result).toMatchObject({
      projectId: "individual",
      error: "Runner unavailable",
      status: "retry",
    });
    await expect(db.project.findUnique({ where: { id: "individual" } }))
      .resolves.toMatchObject({ deletedAt: requestedAt });
    await expect(db.projectDeletionTask.findUnique({
      where: { projectId: "individual" },
    })).resolves.toMatchObject({
      attempts: 1,
      lastError: "Runner unavailable",
      leaseExpiresAt: null,
      leaseOwner: null,
      status: "retry",
    });
  });
});
