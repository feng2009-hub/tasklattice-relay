import { describe, expect, it, vi } from "vitest";
import type {
  ControlJobMetadata,
  PgBossControlJobQueue,
  ProjectDeletionJobPayload,
  ProjectRuntimeReconcileJobPayload,
} from "../jobs/control-job-queue";
import type { StructuredLogger } from "../observability/structured-logger";
import type { ProjectDeletionService } from "../projects/project-deletion-service";
import type { ProjectRuntimeTargetService } from "../projects/project-runtime-target-service";
import { createTestPrisma } from "../test/prisma";
import { ControlWorkerTasks } from "./control-worker-tasks";

function metadata<T extends object>(
  name: string,
  data: T,
  input: { retryCount?: number; retryLimit?: number } = {},
): ControlJobMetadata<T> {
  return {
    data,
    id: "00000000-0000-4000-8000-000000000101",
    name,
    retryCount: input.retryCount ?? 0,
    retryLimit: input.retryLimit ?? 25,
  } as ControlJobMetadata<T>;
}

function quietLogger(): StructuredLogger {
  return { log: vi.fn() };
}

describe("ControlWorkerTasks", () => {
  it("records retry and terminal failure state around Project deletion", async () => {
    const db = createTestPrisma();
    const requestedAt = new Date("2026-08-27T08:00:00.000Z");
    await db.project.update({
      where: { id: "individual" },
      data: { deletedAt: requestedAt, deletedBy: "local-admin" },
    });
    await db.projectDeletionTask.create({
      data: {
        nextAttemptAt: requestedAt,
        projectId: "individual",
        scheduledFor: requestedAt,
      },
    });
    const purge = vi.fn(async () => {
      throw new Error("Runner unavailable");
    });
    const tasks = new ControlWorkerTasks({
      db,
      deletionService: { purge } as unknown as ProjectDeletionService,
      jobs: {} as PgBossControlJobQueue,
      logger: quietLogger(),
      runtimeTargets: {} as ProjectRuntimeTargetService,
    });

    await expect(tasks.projectDeletion(metadata<ProjectDeletionJobPayload>(
      "control-project-delete",
      { projectId: "individual" },
    ))).rejects.toThrow("Runner unavailable");
    await expect(db.projectDeletionTask.findUnique({
      where: { projectId: "individual" },
    })).resolves.toMatchObject({
      attempts: 1,
      lastError: "Runner unavailable",
      queueJobId: "00000000-0000-4000-8000-000000000101",
      status: "retry",
    });

    await expect(tasks.projectDeletion(metadata<ProjectDeletionJobPayload>(
      "control-project-delete",
      { projectId: "individual" },
      { retryCount: 25, retryLimit: 25 },
    ))).rejects.toThrow("Runner unavailable");
    await expect(db.projectDeletionTask.findUnique({
      where: { projectId: "individual" },
    })).resolves.toMatchObject({
      attempts: 26,
      status: "failed",
    });
  });

  it("attaches historical deletion tasks to the durable queue", async () => {
    const db = createTestPrisma();
    const scheduledFor = new Date("2026-08-27T08:00:00.000Z");
    await db.project.update({
      where: { id: "individual" },
      data: { deletedAt: scheduledFor, deletedBy: "local-admin" },
    });
    await db.projectDeletionTask.create({
      data: {
        nextAttemptAt: scheduledFor,
        projectId: "individual",
        scheduledFor,
      },
    });
    const enqueueProjectDeletion = vi.fn(async () =>
      "00000000-0000-4000-8000-000000000102"
    );
    const jobs = {
      enqueueProjectDeletion,
    } as unknown as PgBossControlJobQueue;
    const tasks = new ControlWorkerTasks({
      db,
      deletionService: {} as ProjectDeletionService,
      jobs,
      logger: quietLogger(),
      runtimeTargets: {} as ProjectRuntimeTargetService,
    });

    await expect(tasks.attachHistoricalDeletionJobs(scheduledFor))
      .resolves.toBe(1);
    expect(enqueueProjectDeletion).toHaveBeenCalledWith(
      "individual",
      scheduledFor,
      expect.any(Object),
    );
    await expect(db.projectDeletionTask.findUnique({
      where: { projectId: "individual" },
    })).resolves.toMatchObject({
      queueJobId: "00000000-0000-4000-8000-000000000102",
      status: "scheduled",
    });
  });

  it("does not reconcile a Project after deletion has started", async () => {
    const db = createTestPrisma();
    await db.project.update({
      where: { id: "individual" },
      data: { deletedAt: new Date(), deletedBy: "local-admin" },
    });
    const ensureProjectNamespace = vi.fn(async () => true);
    const tasks = new ControlWorkerTasks({
      db,
      deletionService: {} as ProjectDeletionService,
      jobs: {} as PgBossControlJobQueue,
      logger: quietLogger(),
      runtimeTargets: {
        ensureProjectNamespace,
      } as unknown as ProjectRuntimeTargetService,
    });

    await expect(tasks.projectRuntimeReconcile(
      metadata<ProjectRuntimeReconcileJobPayload>(
        "control-project-runtime-reconcile",
        { projectId: "individual", reason: "periodic" },
      ),
    )).resolves.toBeUndefined();
    expect(ensureProjectNamespace).not.toHaveBeenCalled();
  });
});
