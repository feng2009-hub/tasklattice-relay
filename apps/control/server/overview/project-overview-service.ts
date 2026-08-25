import type {
  Instance as Agent,
  ProjectOverviewAttentionItem,
  ProjectOverviewRange,
  ProjectOverviewResponse,
  ProjectOverviewUsagePoint,
  ProjectRunSource,
} from "@tali/contracts";
import type { PrismaClient } from "../generated/prisma/client";
import { ProjectStore } from "../projects/project-store";
import { nextBudgetWindow } from "../quotas/budget-window";

const rangeMilliseconds: Record<ProjectOverviewRange, number> = {
  "24h": 24 * 60 * 60 * 1_000,
  "7d": 7 * 24 * 60 * 60 * 1_000,
  "30d": 30 * 24 * 60 * 60 * 1_000,
};

function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

function successRate(rows: Array<{ status: string }>): number | null {
  const eligible = rows.filter((row) =>
    row.status === "SUCCEEDED" || row.status === "FAILED" || row.status === "TIMED_OUT",
  );
  if (!eligible.length) return null;
  return eligible.filter((row) => row.status === "SUCCEEDED").length / eligible.length;
}

function localDate(value: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function timezoneOffsetMs(value: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value ?? 0);
  const represented = Date.UTC(
    read("year"), read("month") - 1, read("day"),
    read("hour"), read("minute"), read("second"),
  );
  return represented - Math.trunc(value.getTime() / 1_000) * 1_000;
}

function localDayStart(date: string, timezone: string): Date {
  const initial = new Date(`${date}T00:00:00.000Z`);
  let result = new Date(initial.getTime() - timezoneOffsetMs(initial, timezone));
  result = new Date(initial.getTime() - timezoneOffsetMs(result, timezone));
  return result;
}

function recentLocalDates(end: Date, count: number, timezone: string): string[] {
  const dates: string[] = [];
  for (let offset = 0; dates.length < count; offset += 1) {
    const date = localDate(new Date(end.getTime() - offset * 24 * 60 * 60 * 1_000), timezone);
    if (!dates.includes(date)) dates.push(date);
  }
  return dates.reverse();
}

function bucket(value: Date, range: ProjectOverviewRange, timezone: string): string {
  if (range !== "24h") return localDate(value, timezone);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:00`;
}

function buckets(start: Date, end: Date, range: ProjectOverviewRange, timezone: string): string[] {
  const step = range === "24h" ? 60 * 60 * 1_000 : 24 * 60 * 60 * 1_000;
  const values: string[] = [];
  for (let at = start.getTime(); at < end.getTime(); at += step) {
    const key = bucket(new Date(at), range, timezone);
    if (values.at(-1) !== key) values.push(key);
  }
  const final = bucket(new Date(end.getTime() - 1), range, timezone);
  if (values.at(-1) !== final) values.push(final);
  return values;
}

function runtimeCounts(instances: Agent[]) {
  return {
    ready: instances.filter((instance) => instance.status === "READY").length,
    provisioning: instances.filter((instance) => instance.status === "PROVISIONING").length,
    failed: instances.filter((instance) => instance.status === "FAILED").length,
    destroying: instances.filter((instance) => instance.status === "DESTROYING").length,
    total: instances.length,
  };
}

export interface ProjectInstanceSource {
  list(): Promise<Agent[]>;
}

export class ProjectOverviewService {
  private readonly db: PrismaClient;

  constructor(
    readonly store: ProjectStore,
    private readonly instances: ProjectInstanceSource,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.db = store.database();
  }

  async overview(range: ProjectOverviewRange, timezone: string): Promise<ProjectOverviewResponse> {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(this.clock());
    const now = this.clock();
    const duration = rangeMilliseconds[range];
    const dayCount = range === "7d" ? 7 : range === "30d" ? 30 : undefined;
    const currentDayBuckets = dayCount ? recentLocalDates(now, dayCount, timezone) : undefined;
    const start = currentDayBuckets
      ? localDayStart(currentDayBuckets[0]!, timezone)
      : new Date(now.getTime() - duration);
    const previousDayBuckets = dayCount
      ? recentLocalDates(new Date(start.getTime() - 1), dayCount, timezone)
      : undefined;
    const previousStart = previousDayBuckets
      ? localDayStart(previousDayBuckets[0]!, timezone)
      : new Date(start.getTime() - duration);

    const [runs, facts, quota, checkpoint, liveInstances, storedInstances, skills, policies] = await Promise.all([
      this.db.projectRunRecord.findMany({
        where: {
          projectId: this.store.projectId,
          startedAt: { gte: previousStart, lt: now },
        },
        orderBy: { startedAt: "asc" },
      }),
      this.db.modelUsageFactRecord.findMany({
        where: {
          projectId: this.store.projectId,
          requestStartTime: { gte: previousStart, lt: now },
        },
        orderBy: { requestStartTime: "asc" },
      }),
      this.db.projectQuotaRecord.findUnique({ where: { projectId: this.store.projectId } }),
      this.db.costSyncCheckpointRecord.findUnique({
        where: { projectId_source: { projectId: this.store.projectId, source: "litellm" } },
      }),
      this.instances.list().then(
        (value) => ({ available: true as const, value }),
        () => ({ available: false as const, value: [] as Agent[] }),
      ),
      this.store.list(),
      this.store.listSkillDefinitions(),
      this.db.accessPolicyRecord.findMany({
        where: { projectId: this.store.projectId, deletedAt: null },
        select: { payload: true },
      }),
    ]);

    const currentRuns = runs.filter((run) => run.startedAt >= start);
    const previousRuns = runs.filter((run) => run.startedAt < start);
    const currentFacts = facts.filter((fact) => fact.requestStartTime >= start);
    const previousFacts = facts.filter((fact) => fact.requestStartTime < start);
    const currentSpend = currentFacts.reduce((sum, fact) => sum + Number(fact.totalCostUsd ?? 0), 0);
    const previousSpend = previousFacts.reduce((sum, fact) => sum + Number(fact.totalCostUsd ?? 0), 0);
    const currentSuccess = successRate(currentRuns);
    const previousSuccess = successRate(previousRuns);

    const points = new Map<string, ProjectOverviewUsagePoint>(
      (currentDayBuckets ?? buckets(start, now, range, timezone)).map((key) => [key, {
        bucket: key,
        runs: 0,
        tokens: 0,
        costUsd: 0,
      }]),
    );
    for (const run of currentRuns) {
      const point = points.get(bucket(run.startedAt, range, timezone));
      if (point) point.runs += 1;
    }
    for (const fact of currentFacts) {
      const point = points.get(bucket(fact.requestStartTime, range, timezone));
      if (!point) continue;
      point.tokens += Number(fact.totalTokens);
      point.costUsd += Number(fact.totalCostUsd ?? 0);
    }

    const observedInstances = liveInstances.available ? liveInstances.value : storedInstances;
    const runtime = runtimeCounts(observedInstances);
    const workloadCounts = new Map<ProjectRunSource, number>();
    for (const run of currentRuns) {
      const source = run.agentPlatform as ProjectRunSource;
      workloadCounts.set(source, (workloadCounts.get(source) ?? 0) + 1);
    }
    const totalWorkload = currentRuns.length;
    const workload = (["openclaw", "hermes"] as const)
      .map((runtimeType) => ({
        runtimeType,
        runs: workloadCounts.get(runtimeType) ?? 0,
        percentage: totalWorkload ? (workloadCounts.get(runtimeType) ?? 0) / totalWorkload : 0,
      }))
      .filter((item) => item.runs > 0);

    const budgetDuration = quota?.budgetDuration as "1d" | "7d" | "30d" | null | undefined;
    const budgetLimit = quota?.hardBudgetUsd === null || quota?.hardBudgetUsd === undefined
      ? null
      : Number(quota.hardBudgetUsd);
    const budgetWindow = budgetDuration && budgetLimit !== null
      ? nextBudgetWindow(
          now,
          budgetDuration,
          quota?.budgetPeriodStartedAt,
          quota?.budgetResetsAt,
        )
      : null;
    const budgetStart = budgetWindow?.startedAt ?? start;
    const budgetFacts = budgetStart >= previousStart
      ? facts.filter((fact) => fact.requestStartTime >= budgetStart)
      : await this.db.modelUsageFactRecord.findMany({
          where: {
            projectId: this.store.projectId,
            requestStartTime: { gte: budgetStart, lt: now },
          },
        });
    const budgetUsed = budgetFacts.reduce((sum, fact) => sum + Number(fact.totalCostUsd ?? 0), 0);
    const budgetPercent = budgetLimit && budgetLimit > 0 ? budgetUsed / budgetLimit : null;
    const budgetElapsedMs = budgetWindow ? now.getTime() - budgetWindow.startedAt.getTime() : 0;
    const budgetWindowMs = budgetWindow
      ? budgetWindow.resetsAt.getTime() - budgetWindow.startedAt.getTime()
      : 0;
    const budgetForecast = budgetWindow && checkpoint?.lastSyncAt && budgetElapsedMs > 0
      ? budgetUsed * budgetWindowMs / budgetElapsedMs
      : null;

    const attention: ProjectOverviewAttentionItem[] = [];
    if (budgetPercent !== null && budgetPercent >= 0.8) {
      attention.push({
        code: "BUDGET_THRESHOLD",
        severity: budgetPercent >= 1 ? "critical" : "warning",
        title: "Budget usage",
        description: `Project has used ${(budgetPercent * 100).toFixed(1)}% of its ${budgetDuration ?? "configured"} budget.`,
        href: `/${this.store.projectId}/cost`,
      });
    } else if (budgetLimit !== null && budgetForecast !== null && budgetForecast > budgetLimit) {
      attention.push({
        code: "BUDGET_FORECAST",
        severity: "warning",
        title: "Budget forecast",
        description: `Current spend is projected to exceed the configured budget by $${(budgetForecast - budgetLimit).toFixed(2)}.`,
        href: `/${this.store.projectId}/cost`,
      });
    }
    if (runtime.failed > 0) {
      attention.push({
        code: "INSTANCE_FAILED",
        severity: "critical",
        title: `${runtime.failed} failed Instance${runtime.failed === 1 ? "" : "s"}`,
        description: "One or more Runtime Instances require operator review.",
        href: `/${this.store.projectId}/instances`,
      });
    }
    const eligibleRunCount = currentRuns.filter((run) =>
      run.status === "SUCCEEDED" || run.status === "FAILED" || run.status === "TIMED_OUT",
    ).length;
    if (eligibleRunCount >= 5 && currentSuccess !== null && currentSuccess < 0.95) {
      attention.push({
        code: "RUN_SUCCESS_RATE",
        severity: currentSuccess < 0.8 ? "critical" : "warning",
        title: "Run success rate",
        description: `Run success rate is ${(currentSuccess * 100).toFixed(1)}% for the selected period.`,
        href: `/${this.store.projectId}/traces`,
      });
    }
    const staleRuns = currentRuns.filter((run) =>
      run.status === "RUNNING" && run.startedAt < new Date(now.getTime() - 60 * 60 * 1_000),
    ).length;
    if (staleRuns > 0) {
      attention.push({
        code: "RUN_STALE",
        severity: "warning",
        title: `${staleRuns} long-running Run${staleRuns === 1 ? "" : "s"}`,
        description: "Run telemetry has not received a terminal event for more than one hour.",
        href: `/${this.store.projectId}/traces`,
      });
    }
    const costSyncAgeMs = checkpoint?.lastSyncAt
      ? now.getTime() - checkpoint.lastSyncAt.getTime()
      : null;
    if (quota?.litellmTeamId && (costSyncAgeMs === null || costSyncAgeMs > 5 * 60 * 1_000)) {
      attention.push({
        code: "COST_DATA_STALE",
        severity: "warning",
        title: "Cost data is stale",
        description: checkpoint?.lastSyncAt
          ? "LiteLLM cost facts have not refreshed in the last five minutes."
          : "No successful LiteLLM cost ingestion has completed for this Project.",
        href: `/${this.store.projectId}/cost`,
      });
    }
    const costQualityIssues = currentFacts.filter((fact) =>
      fact.costStatus !== "known" || !fact.instanceId,
    ).length;
    if (costQualityIssues > 0) {
      attention.push({
        code: "COST_DATA_QUALITY",
        severity: "warning",
        title: "Cost attribution needs review",
        description: `${costQualityIssues} model request${costQualityIssues === 1 ? "" : "s"} lack a known price or Instance attribution.`,
        href: `/${this.store.projectId}/cost`,
      });
    }

    const runtimeObservedAt = observedInstances
      .map((instance) => instance.updatedAt)
      .sort()
      .at(-1) ?? null;
    return {
      projectId: this.store.projectId,
      range,
      timezone,
      generatedAt: now.toISOString(),
      freshness: {
        costLastSyncedAt: checkpoint?.lastSyncAt?.toISOString() ?? null,
        costSyncLagSeconds: checkpoint?.syncLagSeconds ?? null,
        runtimeObservedAt,
      },
      kpis: {
        runs: currentRuns.length,
        runsChangePercent: percentChange(currentRuns.length, previousRuns.length),
        successRate: currentSuccess,
        successRateChangePoints: currentSuccess === null || previousSuccess === null
          ? null
          : (currentSuccess - previousSuccess) * 100,
        readyInstances: runtime.ready,
        totalInstances: runtime.total,
        spendUsd: currentSpend,
        spendChangePercent: percentChange(currentSpend, previousSpend),
      },
      usage: [...points.values()],
      budget: {
        configured: budgetLimit !== null && budgetDuration != null,
        duration: budgetDuration ?? null,
        limitUsd: budgetLimit,
        usedUsd: budgetUsed,
        usedPercent: budgetPercent,
        remainingUsd: budgetLimit === null ? null : Math.max(0, budgetLimit - budgetUsed),
        forecastUsd: budgetForecast,
        periodStartedAt: budgetWindow?.startedAt.toISOString() ?? null,
        resetsAt: budgetWindow?.resetsAt.toISOString() ?? null,
      },
      runtime: { available: liveInstances.available, ...runtime },
      workload,
      attention: attention.slice(0, 5),
      resources: {
        runtimeCount: observedInstances.length,
        publishedSkillCount: skills.filter((skill) => skill.status === "PUBLISHED").length,
        memoryEnabledInstanceCount: observedInstances.filter((instance) => Boolean(instance.memory)).length,
        activePolicyCount: policies.filter((policy) =>
          policy.payload
          && typeof policy.payload === "object"
          && !Array.isArray(policy.payload)
          && (policy.payload as Record<string, unknown>).status === "ACTIVE",
        ).length,
      },
    };
  }
}
