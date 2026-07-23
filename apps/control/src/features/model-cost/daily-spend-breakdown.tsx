import { useMemo, useState } from "react";
import type { CostGroupBy, CostTrendPoint } from "@tasklattice/contracts";
import { Download, Ellipsis, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { compactNumber, costGroupLabels, usd } from "./cost-utils";
import { CostEmptyState } from "./cost-states";

type ChartMode = "line" | "stacked";
const colors = [
  "var(--brand-signal)",
  "var(--primary)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--muted-foreground)",
];
const chart = { width: 900, height: 260, left: 58, right: 18, top: 18, bottom: 34 };

function escapeCsv(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadTrendCsv(trend: CostTrendPoint[], filename = "model-cost-trend.csv") {
  const rows = [["Date", "Object", "Spend USD", "Tokens", "Requests"]];
  trend.forEach((point) => point.series.forEach((series) => rows.push([
    point.date,
    series.label,
    String(series.spend),
    String(series.tokens),
    String(series.requests),
  ])));
  const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function ChartTooltip({ point }: { point: CostTrendPoint }) {
  return (
    <div className="w-64 rounded-md border bg-popover p-3 text-xs text-popover-foreground shadow-md">
      <p className="mb-2 font-medium">{point.date}</p>
      <div className="max-h-52 space-y-2 overflow-y-auto">
        {point.series.length ? point.series.map((series, index) => (
          <div key={series.id}>
            <div className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
                <span className="truncate">{series.label}</span>
              </span>
              <strong>{usd(series.spend)}</strong>
            </div>
            <p className="mt-0.5 pl-4 text-[10px] text-muted-foreground">{compactNumber(series.tokens)} tokens · {series.requests.toLocaleString()} requests</p>
          </div>
        )) : <p className="text-muted-foreground">No spend</p>}
      </div>
    </div>
  );
}

export function DailySpendBreakdown({
  groupBy,
  trend,
}: {
  groupBy: CostGroupBy;
  trend: CostTrendPoint[];
}) {
  const [mode, setMode] = useState<ChartMode>("line");
  const [activeIndex, setActiveIndex] = useState<number>();
  const series = useMemo(() => {
    const map = new Map<string, string>();
    trend.forEach((point) => point.series.forEach((item) => map.set(item.id, item.label)));
    return [...map].map(([id, label]) => ({ id, label }));
  }, [trend]);
  const totals = trend.map((point) => point.series.reduce((sum, item) => sum + item.spend, 0));
  const max = Math.max(0, ...totals, ...trend.flatMap((point) => point.series.map((item) => item.spend)));
  const hasSpend = max > 0;
  const innerWidth = chart.width - chart.left - chart.right;
  const innerHeight = chart.height - chart.top - chart.bottom;
  const x = (index: number) => chart.left + (trend.length <= 1 ? innerWidth / 2 : (index / (trend.length - 1)) * innerWidth);
  const y = (value: number) => chart.top + innerHeight - (max > 0 ? (value / max) * innerHeight : 0);
  const tickIndexes = [...new Set([0, Math.floor((trend.length - 1) / 4), Math.floor((trend.length - 1) / 2), Math.floor(((trend.length - 1) * 3) / 4), trend.length - 1])].filter((index) => index >= 0);

  return (
    <Card className="gap-0 py-0 shadow-none">
      <CardHeader className="flex min-h-14 flex-col items-stretch justify-between gap-3 border-b px-4 py-3 sm:flex-row sm:items-center">
        <div>
          <CardTitle>Daily spend breakdown</CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">Top five {costGroupLabels[groupBy]}s; remaining spend is grouped as Others.</p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={mode} onValueChange={(value) => setMode(value as ChartMode)}>
            <TabsList className="h-8">
              <TabsTrigger className="h-7 px-2.5" value="line">Line</TabsTrigger>
              <TabsTrigger className="h-7 px-2.5" value="stacked">Stacked bar</TabsTrigger>
            </TabsList>
          </Tabs>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="More chart actions"><Ellipsis /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => downloadTrendCsv(trend)}><FileDown />Download daily totals</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" onClick={() => downloadTrendCsv(trend)} disabled={!hasSpend}><Download />Download CSV</Button>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <div className="overflow-x-auto">
        <div className="relative min-h-72 min-w-[620px]">
          <svg
            role="img"
            aria-label={`Daily USD spend ${mode === "line" ? "line" : "stacked bar"} chart`}
            className="h-auto w-full"
            viewBox={`0 0 ${chart.width} ${chart.height}`}
          >
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
              const tickY = chart.top + innerHeight - ratio * innerHeight;
              return (
                <g key={ratio}>
                  <line x1={chart.left} x2={chart.width - chart.right} y1={tickY} y2={tickY} stroke="var(--border)" strokeWidth="1" />
                  <text x={chart.left - 8} y={tickY + 4} textAnchor="end" fill="var(--muted-foreground)" fontSize="10">{usd(max * ratio)}</text>
                </g>
              );
            })}
            {tickIndexes.map((index) => (
              <text key={index} x={x(index)} y={chart.height - 8} textAnchor="middle" fill="var(--muted-foreground)" fontSize="10">{trend[index]?.date.slice(5)}</text>
            ))}
            {mode === "line" ? series.map((entry, seriesIndex) => {
              const path = trend.map((point, index) => {
                const value = point.series.find((item) => item.id === entry.id)?.spend ?? 0;
                return `${index ? "L" : "M"} ${x(index)} ${y(value)}`;
              }).join(" ");
              return <path key={entry.id} d={path} fill="none" stroke={colors[seriesIndex % colors.length]} strokeWidth="2" vectorEffect="non-scaling-stroke" />;
            }) : trend.map((point, pointIndex) => {
              let offset = 0;
              const barWidth = Math.max(2, Math.min(18, innerWidth / Math.max(1, trend.length) - 2));
              return point.series.map((entry) => {
                const seriesIndex = series.findIndex((item) => item.id === entry.id);
                const height = max > 0 ? (entry.spend / max) * innerHeight : 0;
                const rect = <rect key={`${point.date}-${entry.id}`} x={x(pointIndex) - barWidth / 2} y={chart.top + innerHeight - offset - height} width={barWidth} height={height} fill={colors[seriesIndex % colors.length]} />;
                offset += height;
                return rect;
              });
            })}
            {activeIndex !== undefined ? <line x1={x(activeIndex)} x2={x(activeIndex)} y1={chart.top} y2={chart.top + innerHeight} stroke="var(--foreground)" strokeDasharray="3 3" opacity=".35" /> : null}
          </svg>
          <div className="absolute inset-x-0 top-0 aspect-[900/260]">
            {trend.map((point, index) => (
              <button
                key={point.date}
                type="button"
                aria-label={`${point.date} spend details`}
                className="absolute top-[7%] h-[80%] focus-visible:bg-primary/5 focus-visible:outline-none"
                style={{ left: `${(x(index) / chart.width) * 100}%`, width: `${Math.max(1.2, 100 / Math.max(1, trend.length))}%`, transform: "translateX(-50%)" }}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(undefined)}
                onFocus={() => setActiveIndex(index)}
                onBlur={() => setActiveIndex(undefined)}
              />
            ))}
          </div>
          {!hasSpend ? <div className="absolute inset-0 grid place-items-center"><CostEmptyState compact /></div> : null}
          {activeIndex !== undefined && trend[activeIndex] ? (
            <div
              className={cn("pointer-events-none absolute top-2 z-10", activeIndex > trend.length / 2 ? "right-3" : "left-16")}
            >
              <ChartTooltip point={trend[activeIndex]} />
            </div>
          ) : null}
        </div>
        </div>
        {series.length ? (
          <div className="flex flex-wrap gap-x-5 gap-y-2 border-t pt-3 text-[11px] text-muted-foreground">
            {series.map((entry, index) => (
              <span key={entry.id} className="flex max-w-48 items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
                <span className="truncate">{entry.label}</span>
              </span>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
