import type { Instance as Agent } from "@tali/contracts";
import { describe, expect, it } from "vitest";
import type { ModelUsageFact } from "../providers/cost-analytics-store";
import { ProjectStore } from "../projects/project-store";
import { createTestPrisma } from "../test/prisma";
import { RunStore } from "../runs/run-store";
import { ProjectOverviewService } from "./project-overview-service";

const now = new Date("2026-08-13T12:00:00.000Z");
const instanceId = "11111111-1111-4111-8111-111111111111";

function instance(status: Agent["status"], platform: Agent["agentPlatform"], id = instanceId): Agent {
  return {
    id,
    status,
    agentPlatform: platform,
    updatedAt: now.toISOString(),
  } as Agent;
}

function usageFact(input: {
  requestId: string;
  at: string;
  spend: number;
  tokens: number;
}): ModelUsageFact {
  return {
    eventId: `litellm:${input.requestId}`,
    requestId: input.requestId,
    requestStartTime: input.at,
    usageDate: input.at.slice(0, 10),
    usageHour: new Date(input.at).getUTCHours(),
    projectId: "individual",
    instanceId,
    instanceName: "Research",
    requestedModel: "tali/research",
    resolvedModel: "tali/research",
    modelGroup: "research",
    provider: "LiteLLM",
    callType: "chat",
    promptTokens: input.tokens,
    completionTokens: 0,
    totalTokens: input.tokens,
    cachedInputTokens: 0,
    cacheCreationInputTokens: 0,
    reasoningTokens: 0,
    totalCostUsd: input.spend,
    costStatus: "known",
    costSource: "litellm:spend",
    priceVersion: "test",
    requestCount: 1,
    successCount: 1,
    failureCount: 0,
    retryCount: 0,
    cacheHit: false,
    fallbackUsed: false,
    status: "success",
    tags: [],
    metadata: {},
    sourceRecordHash: input.requestId,
    createdAt: input.at,
  };
}

async function recordRun(
  store: ProjectStore,
  input: {
    runId: string;
    at: string;
    status: "SUCCEEDED" | "FAILED" | "TIMED_OUT";
    platform?: "openclaw" | "hermes";
  },
) {
  const platform = input.platform ?? "openclaw";
  const runs = new RunStore(store.projectId, store.database());
  await runs.ingest({
    instanceId,
    source: platform,
    event: {
      event: "started",
      runId: input.runId,
      occurredAt: input.at,
      triggerType: "USER",
    },
  });
  await runs.ingest({
    instanceId,
    source: platform,
    event: {
      event: "finished",
      runId: input.runId,
      occurredAt: new Date(new Date(input.at).getTime() + 1_000).toISOString(),
      status: input.status,
      terminalReason: input.status === "SUCCEEDED" ? "COMPLETED" : "RUNTIME_ERROR",
    },
  });
}

describe("ProjectOverviewService", () => {
  it("aggregates real Run, usage, budget, Runtime, workload, and attention facts", async () => {
    const db = createTestPrisma();
    const store = new ProjectStore("individual", db);
    const currentStatuses = [
      "SUCCEEDED",
      "SUCCEEDED",
      "SUCCEEDED",
      "SUCCEEDED",
      "FAILED",
      "TIMED_OUT",
    ] as const;
    for (const [index, status] of currentStatuses.entries()) {
      await recordRun(store, {
        runId: `current-${index}`,
        at: `2026-08-${10 + Math.floor(index / 2)}T0${index}:00:00.000Z`,
        status,
        platform: index < 4 ? "openclaw" : "hermes",
      });
    }
    await recordRun(store, {
      runId: "previous-1",
      at: "2026-08-03T10:00:00.000Z",
      status: "SUCCEEDED",
    });
    await recordRun(store, {
      runId: "previous-2",
      at: "2026-08-04T10:00:00.000Z",
      status: "SUCCEEDED",
    });
    await store.costAnalytics().insertFact(usageFact({
      requestId: "current-cost-1",
      at: "2026-08-11T10:00:00.000Z",
      spend: 25,
      tokens: 200,
    }));
    await store.costAnalytics().insertFact(usageFact({
      requestId: "current-cost-2",
      at: "2026-08-12T10:00:00.000Z",
      spend: 15,
      tokens: 100,
    }));
    await store.costAnalytics().insertFact(usageFact({
      requestId: "previous-cost",
      at: "2026-08-04T10:00:00.000Z",
      spend: 10,
      tokens: 50,
    }));
    await db.projectQuotaRecord.update({
      where: { projectId: "individual" },
      data: {
        hardBudgetUsd: 50,
        budgetDuration: "7d",
        budgetPeriodStartedAt: new Date("2026-08-07T12:00:00.000Z"),
        budgetResetsAt: new Date("2026-08-14T12:00:00.000Z"),
      },
    });
    await db.costSyncCheckpointRecord.create({
      data: {
        projectId: "individual",
        source: "litellm",
        lastSyncAt: new Date("2026-08-13T11:59:00.000Z"),
        lastSuccessfulEndTime: new Date("2026-08-13T11:59:00.000Z"),
        syncLagSeconds: 60,
      },
    });
    const service = new ProjectOverviewService(
      store,
      {
        list: async () => [
          instance("READY", "openclaw"),
          instance("FAILED", "hermes", "22222222-2222-4222-8222-222222222222"),
        ],
      },
      () => now,
    );

    const overview = await service.overview("7d", "UTC");

    expect(overview.kpis).toMatchObject({
      runs: 6,
      runsChangePercent: 200,
      successRate: 4 / 6,
      successRateChangePoints: (4 / 6 - 1) * 100,
      readyInstances: 1,
      totalInstances: 2,
      spendUsd: 40,
      spendChangePercent: 300,
    });
    expect(overview.usage).toHaveLength(7);
    expect(overview.usage.reduce((sum, point) => sum + point.runs, 0)).toBe(6);
    expect(overview.usage.reduce((sum, point) => sum + point.tokens, 0)).toBe(300);
    expect(overview.budget).toMatchObject({
      configured: true,
      duration: "7d",
      limitUsd: 50,
      usedUsd: 40,
      usedPercent: 0.8,
      remainingUsd: 10,
      periodStartedAt: "2026-08-07T12:00:00.000Z",
      resetsAt: "2026-08-14T12:00:00.000Z",
    });
    expect(overview.budget.forecastUsd).toBeCloseTo(46.67, 1);
    expect(overview.workload).toEqual([
      { runtimeType: "hermes", runs: 2, percentage: 2 / 6 },
      { runtimeType: "openclaw", runs: 4, percentage: 4 / 6 },
    ]);
    expect(overview.attention.map((item) => item.code)).toEqual([
      "BUDGET_THRESHOLD",
      "INSTANCE_FAILED",
      "RUN_SUCCESS_RATE",
    ]);
    expect(overview.freshness).toMatchObject({
      costLastSyncedAt: "2026-08-13T11:59:00.000Z",
      costSyncLagSeconds: 60,
      runtimeObservedAt: now.toISOString(),
    });
  });

  it("returns honest zero and null values instead of synthetic data", async () => {
    const db = createTestPrisma();
    const store = new ProjectStore("individual", db);
    const service = new ProjectOverviewService(
      store,
      { list: async () => [] },
      () => now,
    );

    const overview = await service.overview("24h", "Asia/Shanghai");

    expect(overview.kpis).toMatchObject({
      runs: 0,
      runsChangePercent: 0,
      successRate: null,
      successRateChangePoints: null,
      readyInstances: 0,
      totalInstances: 0,
      spendUsd: 0,
      spendChangePercent: 0,
    });
    expect(overview.usage).toHaveLength(24);
    expect(overview.workload).toEqual([]);
    expect(overview.attention).toEqual([]);
  });
});
