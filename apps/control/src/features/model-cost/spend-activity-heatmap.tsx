import { useMemo, useState } from "react";
import type { CostDailyPoint, CostGroupBy } from "@tasklattice/contracts";
import { Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { compactNumber, costGroupLabels, fillDailyActivity, usd } from "./cost-utils";

type ActivityMode = "daily" | "weekly" | "cumulative";
type HeatmapCell = CostDailyPoint & { label: string };

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const intensityColors = [
  "var(--cost-heatmap-0)",
  "var(--cost-heatmap-1)",
  "var(--cost-heatmap-2)",
  "var(--cost-heatmap-3)",
  "var(--cost-heatmap-4)",
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function weekStart(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function uniqueActive(points: CostDailyPoint[]): string[] {
  return [...new Set(points.flatMap((point) => point.activeObjectIds ?? []))];
}

function buildWeekly(points: CostDailyPoint[]): HeatmapCell[] {
  const weeks = new Map<string, CostDailyPoint[]>();
  for (const point of points) {
    const start = weekStart(point.date);
    weeks.set(start, [...(weeks.get(start) ?? []), point]);
  }
  return [...weeks].map(([start, week]) => {
    const activeObjectIds = uniqueActive(week);
    return {
      date: start,
      label: `${formatDate(start)} – ${formatDate(addDays(start, 6))}`,
      spend: week.reduce((sum, point) => sum + point.spend, 0),
      tokens: week.reduce((sum, point) => sum + point.tokens, 0),
      requests: week.reduce((sum, point) => sum + point.requests, 0),
      active: activeObjectIds.length || Math.max(0, ...week.map((point) => point.active)),
      activeObjectIds,
    };
  });
}

function buildCumulative(points: CostDailyPoint[]): HeatmapCell[] {
  let spend = 0;
  let tokens = 0;
  let requests = 0;
  const active = new Set<string>();
  return points.map((point) => {
    spend += point.spend;
    tokens += point.tokens;
    requests += point.requests;
    point.activeObjectIds?.forEach((id) => active.add(id));
    return {
      ...point,
      label: `${formatDate(point.date)} · cumulative`,
      spend,
      tokens,
      requests,
      active: active.size || point.active,
      activeObjectIds: [...active],
    };
  });
}

function level(spend: number, max: number): number {
  if (spend <= 0 || max <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((spend / max) * 4)));
}

function ActivityTooltip({
  cell,
  groupBy,
}: {
  cell: HeatmapCell;
  groupBy: CostGroupBy;
}) {
  const activeLabel = costGroupLabels[groupBy];
  return (
    <div className="min-w-52 space-y-1 py-1">
      <p className="mb-2 font-medium">{cell.label}</p>
      <div className="flex justify-between gap-6"><span className="opacity-70">Spend</span><strong>{usd(cell.spend)}</strong></div>
      <div className="flex justify-between gap-6"><span className="opacity-70">Tokens</span><strong>{compactNumber(cell.tokens)}</strong></div>
      <div className="flex justify-between gap-6"><span className="opacity-70">Requests</span><strong>{cell.requests.toLocaleString()}</strong></div>
      <div className="flex justify-between gap-6"><span className="opacity-70">Active {activeLabel}s</span><strong>{cell.active}</strong></div>
    </div>
  );
}

export function SpendActivityHeatmap({
  activity,
  from,
  to,
  groupBy,
}: {
  activity: CostDailyPoint[];
  from: string;
  to: string;
  groupBy: CostGroupBy;
}) {
  const [mode, setMode] = useState<ActivityMode>("daily");
  const daily = useMemo(() => fillDailyActivity(activity, from, to), [activity, from, to]);
  const cells = useMemo<HeatmapCell[]>(() => {
    if (mode === "weekly") return buildWeekly(daily);
    if (mode === "cumulative") return buildCumulative(daily);
    return daily.map((point) => ({ ...point, label: formatDate(point.date) }));
  }, [daily, mode]);
  const max = Math.max(0, ...cells.map((point) => point.spend));
  const hasSpend = daily.some((point) => point.spend > 0);
  const start = weekStart(from);
  const end = addDays(weekStart(to), 6);
  const fullGrid = fillDailyActivity(daily, start, end);
  const gridCells = mode === "weekly"
    ? cells
    : fullGrid.map((point) => {
        const transformed = cells.find((cell) => cell.date === point.date);
        return transformed
          ? { ...transformed, outside: point.date < from || point.date > to }
          : { ...point, label: formatDate(point.date), outside: true };
      });
  const weekCount = Math.ceil(fullGrid.length / 7);
  const monthLabels = Array.from({ length: weekCount }, (_, index) => {
    const date = addDays(start, index * 7);
    const day = new Date(`${date}T00:00:00.000Z`).getUTCDate();
    const previous = index ? addDays(start, (index - 1) * 7) : undefined;
    const changed = !previous || new Date(`${previous}T00:00:00.000Z`).getUTCMonth() !== new Date(`${date}T00:00:00.000Z`).getUTCMonth();
    return changed || day <= 7
      ? new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00.000Z`))
      : "";
  });

  return (
    <Card className="gap-0 py-0 shadow-none">
      <CardHeader className="flex min-h-11 flex-row items-center justify-between gap-4 px-4 py-2">
        <CardTitle className="flex items-center gap-2 font-sans text-sm font-medium">
          Spend activity
          <Info className="size-3 text-muted-foreground" aria-hidden="true" />
        </CardTitle>
        <Tabs value={mode} onValueChange={(value) => setMode(value as ActivityMode)}>
          <TabsList className="h-8 gap-1 bg-transparent p-0">
            <TabsTrigger className="h-7 px-2.5" value="daily">Daily</TabsTrigger>
            <TabsTrigger className="h-7 px-2.5" value="weekly">Weekly</TabsTrigger>
            <TabsTrigger className="h-7 px-2.5" value="cumulative">Cumulative</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="px-4 pb-3 pt-1">
        <TooltipProvider>
          <div className="flex min-w-0 items-center gap-5">
            <div className="min-w-0 flex-1 overflow-x-auto pb-1">
              <div className="min-w-max">
                <div className="mb-1.5 ml-10 grid h-3 gap-1 text-[10px] text-muted-foreground" style={{ gridTemplateColumns: `repeat(${weekCount}, 0.625rem)` }}>
                  {monthLabels.map((label, index) => <span key={`${label}-${index}`} className="whitespace-nowrap">{label}</span>)}
                </div>
                <div className="flex gap-2">
                  {mode !== "weekly" ? (
                    <div className="grid grid-rows-7 gap-1 pr-1 text-[10px] leading-2.5 text-muted-foreground">
                      {weekdays.map((day, index) => <span key={day}>{index % 2 ? day : ""}</span>)}
                    </div>
                  ) : <div className="w-8 text-[10px] text-muted-foreground">Week</div>}
                  <div
                    className={cn("grid gap-1", mode === "weekly" ? "grid-flow-col grid-rows-1" : "grid-flow-col grid-rows-7")}
                  >
                    {gridCells.map((cell) => {
                      const cellLevel = level(cell.spend, max);
                      const outside = "outside" in cell && cell.outside === true;
                      return (
                        <Tooltip key={`${mode}-${cell.date}`}>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              aria-label={`${cell.label}: ${usd(cell.spend)}`}
                              className={cn(
                                "size-2.5 rounded-[2px] border border-black/[0.035] transition-transform hover:scale-125 focus-visible:z-10 focus-visible:scale-125 focus-visible:outline-2 focus-visible:outline-offset-1",
                                outside && "pointer-events-none opacity-25",
                              )}
                              style={{ backgroundColor: intensityColors[cellLevel] }}
                            />
                          </TooltipTrigger>
                          {!outside ? <TooltipContent sideOffset={7}><ActivityTooltip cell={cell} groupBy={groupBy} /></TooltipContent> : null}
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
            <div className="hidden shrink-0 items-center gap-2 text-[10px] text-muted-foreground sm:flex">
              <div className="flex flex-col-reverse gap-1">
                {intensityColors.map((color, index) => (
                  <span key={color} className="size-3 rounded-[2px] border border-black/[0.035]" style={{ backgroundColor: color }} aria-label={`Spend intensity ${index}`} />
                ))}
              </div>
              <span className="flex h-[4.75rem] flex-col justify-between">
                <span>More spend</span>
                <span>Less spend</span>
              </span>
            </div>
          </div>
        </TooltipProvider>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t pt-2 text-[11px] text-muted-foreground">
          <span>{hasSpend ? `${from} – ${to}` : "No spend in this period"}</span>
          <span className="flex items-center gap-1.5 sm:hidden">
            Less spend
            {intensityColors.map((color, index) => <span key={color} className="size-3 rounded-[2px] border border-black/[0.035]" style={{ backgroundColor: color }} aria-label={`Spend intensity ${index}`} />)}
            More spend
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
