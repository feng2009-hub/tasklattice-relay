import { describe, expect, it } from "vitest";
import { ProjectStore } from "../projects/project-store";
import { createTestPrisma } from "../test/prisma";
import { RunStore } from "./run-store";

describe("RunStore", () => {
  it("records one top-level Run idempotently and keeps the first terminal result", async () => {
    const db = createTestPrisma();
    const runs = new RunStore("individual", db);
    const started = {
      event: "started" as const,
      runId: "runtime-run-1",
      occurredAt: "2026-08-13T01:00:00.000Z",
      triggerType: "USER" as const,
    };

    const first = await runs.ingest({
      instanceId: "11111111-1111-4111-8111-111111111111",
      source: "openclaw",
      event: started,
    });
    const replay = await runs.ingest({
      instanceId: first.instanceId,
      source: "openclaw",
      event: started,
    });
    expect(replay.id).toBe(first.id);
    expect(replay.status).toBe("RUNNING");

    const completed = await runs.ingest({
      instanceId: first.instanceId,
      source: "openclaw",
      event: {
        event: "finished",
        runId: started.runId,
        occurredAt: "2026-08-13T01:00:02.500Z",
        status: "SUCCEEDED",
        terminalReason: "COMPLETED",
      },
    });
    expect(completed).toMatchObject({
      id: first.id,
      status: "SUCCEEDED",
      durationMs: 2_500,
      terminalReason: "COMPLETED",
    });

    const conflictingReplay = await runs.ingest({
      instanceId: first.instanceId,
      source: "openclaw",
      event: {
        event: "finished",
        runId: started.runId,
        occurredAt: "2026-08-13T01:00:03.000Z",
        status: "FAILED",
        terminalReason: "RUNTIME_ERROR",
      },
    });
    expect(conflictingReplay.status).toBe("SUCCEEDED");
  });

  it("isolates identical Runtime Run IDs between Projects", async () => {
    const db = createTestPrisma();
    await db.project.create({
      data: {
        id: "project-b",
        name: "Project B",
        createdBy: "local-admin",
      },
    });
    const first = new RunStore("individual", db);
    const second = new RunStore("project-b", db);
    const event = {
      event: "started" as const,
      runId: "same-upstream-id",
      occurredAt: "2026-08-13T01:00:00.000Z",
      triggerType: "USER" as const,
    };
    await first.ingest({
      instanceId: "11111111-1111-4111-8111-111111111111",
      source: "openclaw",
      event,
    });
    await second.ingest({
      instanceId: "22222222-2222-4222-8222-222222222222",
      source: "openclaw",
      event,
    });

    await expect(
      db.projectRunRecord.count({ where: { projectId: "individual" } }),
    ).resolves.toBe(1);
    await expect(
      db.projectRunRecord.count({ where: { projectId: "project-b" } }),
    ).resolves.toBe(1);
    expect((await first.get(
      "11111111-1111-4111-8111-111111111111",
      "openclaw",
      event.runId,
    ))?.projectId).toBe("individual");
  });

  it("accepts a terminal event when the start delivery was lost", async () => {
    const db = createTestPrisma();
    const runs = new RunStore("individual", db);
    const completed = await runs.ingest({
      instanceId: "11111111-1111-4111-8111-111111111111",
      source: "hermes",
      event: {
        event: "finished",
        runId: "terminal-only",
        occurredAt: "2026-08-13T01:00:05.000Z",
        status: "SUCCEEDED",
        durationMs: 5_000,
        terminalReason: "COMPLETED",
      },
    });
    expect(completed).toMatchObject({
      status: "SUCCEEDED",
      startedAt: "2026-08-13T01:00:00.000Z",
      endedAt: "2026-08-13T01:00:05.000Z",
      durationMs: 5_000,
    });
  });
});
