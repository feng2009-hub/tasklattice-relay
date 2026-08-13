import { lazy, Suspense, useState } from "react";
import { ClientOnly, Link } from "@tanstack/react-router";
import type {
  ProjectOverviewAttentionItem,
  ProjectOverviewRange,
  ProjectOverviewResponse,
} from "@tali/contracts";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BrainCircuit,
  CheckCircle2,
  CircleAlert,
  ServerCog,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import type { UsageMetric } from "./usage-chart";

const UsageChart = lazy(() =>
  import("./usage-chart").then((module) => ({ default: module.UsageChart })),
);

const rangeLabels: Record<ProjectOverviewRange, string> = {
  "24h": "Last 24h",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
};

const metricLabels: Record<UsageMetric, string> = {
  runs: "Runs",
  tokens: "Tokens",
  cost: "Cost",
};

function number(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function compact(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function money(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function trendText(value: number | null, unit: "percent" | "points" = "percent") {
  if (value === null) return "No comparable previous period";
  if (value === 0) return "No change vs previous period";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}${unit === "percent" ? "%" : " pts"} vs previous period`;
}

function Trend({
  value,
  unit,
}: {
  value: number | null;
  unit?: "percent" | "points";
}) {
  const Icon = value !== null && value < 0 ? ArrowDownRight : ArrowUpRight;
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      {value !== null && value !== 0 ? <Icon className="size-3.5" aria-hidden /> : null}
      {trendText(value, unit)}
    </span>
  );
}

export function ProjectOverviewHeader({
  projectId,
  range,
  onRangeChange,
}: {
  projectId: string;
  range: ProjectOverviewRange;
  onRangeChange: (range: ProjectOverviewRange) => void;
}) {
  return (
    <PageHeader
      title="Home"
      description={
        <>
          <span className="font-medium text-foreground">Project overview.</span>{" "}
          Usage, runtime health, spend, and activity across this Project.
        </>
      }
      actions={
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <ToggleGroup
            aria-label="Overview time range"
            type="single"
            variant="outline"
            spacing={0}
            size="lg"
            value={range}
            onValueChange={(value) => {
              if (value) onRangeChange(value as ProjectOverviewRange);
            }}
          >
            {(Object.keys(rangeLabels) as ProjectOverviewRange[]).map((value) => (
              <ToggleGroupItem key={value} value={value}>
                {rangeLabels[value]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Button asChild variant="outline">
            <Link to="/$projectId/instances" params={{ projectId }}>
              Review runtime <ArrowRight />
            </Link>
          </Button>
        </div>
      }
    />
  );
}

export function OverviewKpiGrid({ data }: { data: ProjectOverviewResponse }) {
  const cards = [
    {
      label: "Runs",
      value: number(data.kpis.runs),
      detail: <Trend value={data.kpis.runsChangePercent} />,
    },
    {
      label: "Success rate",
      value: data.kpis.successRate === null
        ? "—"
        : `${(data.kpis.successRate * 100).toFixed(1)}%`,
      detail: data.kpis.successRate === null
        ? <span className="text-xs text-muted-foreground">No completed Runs in this period</span>
        : <Trend value={data.kpis.successRateChangePoints} unit="points" />,
    },
    {
      label: "Ready runtime",
      value: `${data.kpis.readyInstances} / ${data.kpis.totalInstances}`,
      detail: (
        <span className={cn(
          "text-xs",
          data.runtime.failed > 0 ? "text-destructive" : "text-muted-foreground",
        )}>
          {data.runtime.failed > 0
            ? `${data.runtime.failed} require attention`
            : data.kpis.totalInstances > 0
              ? "No failed Instances"
              : "No Runtime Instances"}
        </span>
      ),
    },
    {
      label: "Spend",
      value: money(data.kpis.spendUsd),
      detail: data.budget.configured && data.budget.usedPercent !== null
        ? (
            <span className="text-xs text-muted-foreground">
              {(data.budget.usedPercent * 100).toFixed(1)}% of current budget
            </span>
          )
        : <Trend value={data.kpis.spendChangePercent} />,
    },
  ];

  return (
    <section aria-label="Project overview metrics" className="grid overflow-hidden rounded-lg border border-border/65 bg-card sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <article
          key={card.label}
          className="min-h-32 border-b p-4 last:border-b-0 sm:odd:border-r sm:[&:nth-child(3)]:border-b-0 xl:border-b-0 xl:border-r xl:odd:border-r xl:last:border-r-0"
        >
          <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
          <p className="mt-3 font-heading text-3xl tabular-nums tracking-tight">{card.value}</p>
          <div className="mt-3">{card.detail}</div>
        </article>
      ))}
    </section>
  );
}

export function UsageChartCard({ data }: { data: ProjectOverviewResponse }) {
  const [metric, setMetric] = useState<UsageMetric>("runs");
  return (
    <Card className="gap-0 py-0 shadow-none">
      <CardHeader className="flex min-h-16 flex-col items-stretch justify-between gap-3 border-b px-4 py-3 sm:flex-row sm:items-center">
        <div>
          <CardTitle className="font-sans text-sm font-semibold">Usage</CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Top-level Run activity and its attributed model usage.
          </p>
        </div>
        <ToggleGroup
          aria-label="Usage metric"
          type="single"
          variant="outline"
          spacing={0}
          value={metric}
          onValueChange={(value) => {
            if (value) setMetric(value as UsageMetric);
          }}
        >
          {(Object.keys(metricLabels) as UsageMetric[]).map((value) => (
            <ToggleGroupItem key={value} value={value}>
              {metricLabels[value]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </CardHeader>
      <CardContent className="px-2 pb-2 pt-1 sm:px-4">
        <ClientOnly fallback={<UsageChartSkeleton />}>
          <Suspense fallback={<UsageChartSkeleton />}>
            <UsageChart metric={metric} points={data.usage} range={data.range} />
          </Suspense>
        </ClientOnly>
      </CardContent>
    </Card>
  );
}

function UsageChartSkeleton() {
  return (
    <div className="relative h-[300px] overflow-hidden sm:h-[330px]" aria-label="Loading Usage chart" role="status">
      <div className="absolute inset-x-14 bottom-10 top-5 grid grid-rows-4">
        {Array.from({ length: 5 }, (_, index) => <span key={index} className="border-b" />)}
      </div>
      <Skeleton className="absolute inset-x-14 bottom-10 h-1/3" />
    </div>
  );
}

function remainingTime(resetsAt: string | null, generatedAt: string): string | null {
  if (!resetsAt) return null;
  const milliseconds = Math.max(0, new Date(resetsAt).getTime() - new Date(generatedAt).getTime());
  const hours = Math.ceil(milliseconds / (60 * 60 * 1_000));
  return hours > 48 ? `${Math.ceil(hours / 24)} days remaining` : `${hours} hours remaining`;
}

export function BudgetCard({
  budget,
  generatedAt,
  projectId,
}: {
  budget: ProjectOverviewResponse["budget"];
  generatedAt: string;
  projectId: string;
}) {
  if (!budget.configured || budget.limitUsd === null) {
    return (
      <Card className="h-full">
        <CardHeader className="border-b">
          <CardTitle className="font-sans text-sm font-semibold">Project budget</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col justify-center py-8">
          <p className="text-sm font-medium">No budget configured</p>
          <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
            Spend is still tracked. Set a budget to add utilization and forecast signals.
          </p>
        </CardContent>
        <CardFooter className="justify-end">
          <Button asChild variant="ghost" size="sm">
            <Link to="/$projectId/setting" params={{ projectId }} search={{ section: "quota" }}>
              Configure budget <ArrowRight />
            </Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }
  const usedPercent = (budget.usedPercent ?? 0) * 100;
  const remaining = remainingTime(budget.resetsAt, generatedAt);
  const forecastOver = budget.forecastUsd !== null && budget.forecastUsd > budget.limitUsd;
  return (
    <Card className="h-full">
      <CardHeader className="border-b">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="font-sans text-sm font-semibold">
              {budget.duration === "30d" ? "30-day budget" : `${budget.duration} budget`}
            </CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">Current budget window</p>
          </div>
          <Badge variant={usedPercent >= 100 ? "destructive" : "outline"}>
            {usedPercent.toFixed(1)}%
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-center py-6">
        <p className="font-heading text-3xl tabular-nums tracking-tight">
          {money(budget.usedUsd)} <span className="text-base text-muted-foreground">/ {money(budget.limitUsd)}</span>
        </p>
        <Progress
          aria-label={`${usedPercent.toFixed(1)} percent of budget used`}
          value={Math.min(100, Math.max(0, usedPercent))}
          className={cn("mt-5 h-1.5", usedPercent >= 100 && "[&_[data-slot=progress-indicator]]:bg-destructive")}
        />
        <dl className="mt-6 divide-y border-y text-xs">
          <div className="flex min-h-11 items-center justify-between gap-3">
            <dt className="text-muted-foreground">Forecast</dt>
            <dd className={cn("font-medium tabular-nums", forecastOver && "text-destructive")}>
              {budget.forecastUsd === null ? "Awaiting cost sync" : money(budget.forecastUsd)}
            </dd>
          </div>
          <div className="flex min-h-11 items-center justify-between gap-3">
            <dt className="text-muted-foreground">Remaining</dt>
            <dd className="font-medium tabular-nums">{money(budget.remainingUsd ?? 0)}</dd>
          </div>
          <div className="flex min-h-11 items-center justify-between gap-3">
            <dt className="text-muted-foreground">Window</dt>
            <dd className="font-medium">{remaining ?? "Reset unavailable"}</dd>
          </div>
        </dl>
      </CardContent>
      <CardFooter className="justify-end">
        <Button asChild variant="ghost" size="sm">
          <Link to="/$projectId/cost" params={{ projectId }}>
            Review spend <ArrowRight />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

const runtimeStates = [
  { key: "ready", label: "Ready", color: "bg-emerald-500/80" },
  { key: "provisioning", label: "Provisioning", color: "bg-amber-500/75" },
  { key: "failed", label: "Failed", color: "bg-destructive" },
  { key: "destroying", label: "Destroying", color: "bg-muted-foreground/45" },
] as const;

export function RuntimeHealthCard({
  data,
  projectId,
}: {
  data: ProjectOverviewResponse["runtime"];
  projectId: string;
}) {
  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="font-sans text-sm font-semibold">Runtime health</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">Current Instance lifecycle state.</p>
          </div>
          <Badge variant={data.available ? "secondary" : "outline"}>
            {data.available ? "Live" : "Persisted state"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="py-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="font-heading text-3xl tabular-nums">{data.ready}</p>
            <p className="mt-1 text-xs text-muted-foreground">Ready of {data.total} total</p>
          </div>
          {data.failed > 0 ? (
            <span className="flex items-center gap-1 text-xs text-destructive">
              <CircleAlert className="size-3.5" /> {data.failed} failed
            </span>
          ) : null}
        </div>
        <div className="mt-5 flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
          {data.total > 0 ? runtimeStates.map((state) => (
            <span
              key={state.key}
              className={state.color}
              style={{ width: `${(data[state.key] / data.total) * 100}%` }}
            />
          )) : null}
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-3">
          {runtimeStates.map((state) => (
            <div key={state.key} className="flex items-center justify-between gap-3 border-b pb-2 text-xs">
              <dt className="flex items-center gap-2 text-muted-foreground">
                <span className={cn("size-2 rounded-full", state.color)} /> {state.label}
              </dt>
              <dd className="font-medium tabular-nums">{data[state.key]}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
      <CardFooter className="justify-end">
        <Button asChild variant="ghost" size="sm">
          <Link to="/$projectId/instances" params={{ projectId }}>
            View runtime <ArrowRight />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

const runtimeLabels = { openclaw: "OpenClaw", hermes: "Hermes" } as const;

export function WorkloadDistributionCard({
  workload,
  projectId,
}: {
  workload: ProjectOverviewResponse["workload"];
  projectId: string;
}) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="font-sans text-sm font-semibold">Workload distribution</CardTitle>
        <p className="mt-0.5 text-xs text-muted-foreground">Top-level Runs by Runtime type.</p>
      </CardHeader>
      <CardContent className="flex min-h-56 flex-col justify-center py-5">
        {workload.length ? (
          <div className="space-y-5">
            {workload.map((item) => (
              <div key={item.runtimeType}>
                <div className="flex items-center justify-between gap-4 text-xs">
                  <span className="font-medium">{runtimeLabels[item.runtimeType]}</span>
                  <span className="text-muted-foreground">
                    {number(item.runs)} Runs · {(item.percentage * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-[var(--cost-series-1)]"
                    style={{ width: `${Math.min(100, item.percentage * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center">
            <p className="text-sm font-medium">No workload recorded</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Distribution will appear after a Runtime reports its first Run.
            </p>
          </div>
        )}
      </CardContent>
      <CardFooter className="justify-end">
        <Button asChild variant="ghost" size="sm">
          <Link to="/$projectId/traces" params={{ projectId }}>
            View activity <ArrowRight />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

function AttentionRow({ item }: { item: ProjectOverviewAttentionItem }) {
  const Icon = item.severity === "critical" ? CircleAlert : TriangleAlert;
  return (
    <li className="grid gap-3 border-b px-4 py-4 last:border-b-0 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
      <span className={cn(
        "grid size-8 place-items-center rounded-md",
        item.severity === "critical"
          ? "bg-destructive/10 text-destructive"
          : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
      )}>
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium">{item.title}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{item.description}</p>
      </div>
      <Button asChild variant="ghost" size="sm" className="justify-self-start sm:justify-self-end">
        <a href={item.href}>Inspect <ArrowRight /></a>
      </Button>
    </li>
  );
}

export function AttentionListCard({ items }: { items: ProjectOverviewAttentionItem[] }) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="font-sans text-sm font-semibold">Attention</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">Signals that may require an operator decision.</p>
          </div>
          {items.length ? <Badge variant="outline">{items.length} open</Badge> : null}
        </div>
      </CardHeader>
      {items.length ? (
        <ul>{items.map((item) => <AttentionRow key={item.code} item={item} />)}</ul>
      ) : (
        <CardContent className="flex min-h-24 items-center gap-3 py-5">
          <span className="grid size-8 place-items-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-4" />
          </span>
          <div>
            <p className="text-sm font-medium">No issues require attention</p>
            <p className="mt-0.5 text-xs text-muted-foreground">No alert thresholds are currently active.</p>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

type ResourceRoute =
  | "/$projectId/access-policies"
  | "/$projectId/instances"
  | "/$projectId/memory"
  | "/$projectId/skills";

export function ProjectResourcesSummary({
  projectId,
  resources,
}: {
  projectId: string;
  resources: ProjectOverviewResponse["resources"];
}) {
  const entries: Array<{
    label: string;
    value: string;
    icon: typeof ServerCog;
    to: ResourceRoute;
  }> = [
    { label: "Runtime", value: `${resources.runtimeCount} Instances`, icon: ServerCog, to: "/$projectId/instances" },
    { label: "Published skills", value: compact(resources.publishedSkillCount), icon: Sparkles, to: "/$projectId/skills" },
    { label: "Memory", value: `${resources.memoryEnabledInstanceCount} enabled`, icon: BrainCircuit, to: "/$projectId/memory" },
    { label: "Policies", value: `${resources.activePolicyCount} active`, icon: ShieldCheck, to: "/$projectId/access-policies" },
  ];
  return (
    <section aria-labelledby="project-resources-title">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 id="project-resources-title" className="font-sans text-sm font-semibold">Project resources</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Inventory summary and detailed management entry points.</p>
        </div>
      </div>
      <div className="grid overflow-hidden rounded-lg border border-border/65 bg-card sm:grid-cols-2 xl:grid-cols-4">
        {entries.map(({ icon: Icon, label, to, value }) => (
          <Link
            key={label}
            to={to}
            params={{ projectId }}
            className="group flex min-h-20 items-center gap-3 border-b p-4 transition-colors last:border-b-0 hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-offset-[-2px] sm:odd:border-r sm:[&:nth-child(3)]:border-b-0 xl:border-b-0 xl:border-r xl:odd:border-r xl:last:border-r-0"
          >
            <Icon className="size-4 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-muted-foreground">{label}</span>
              <strong className="mt-1 block text-sm font-medium tabular-nums">{value}</strong>
            </span>
            <ArrowRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>
    </section>
  );
}
