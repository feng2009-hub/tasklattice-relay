import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { CostBreakdownItem } from "@tasklattice/contracts";
import { Banknote, Bot, CalendarDays, Cpu, ReceiptText } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";

export const Route = createFileRoute("/providers/cost")({ component: ProviderCostPage });

function dateRange(days: number) {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - days + 1);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function money(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: value < 1 ? 4 : 2, maximumFractionDigits: 4 }).format(value);
}

function ProviderCostPage() {
  const [days, setDays] = useState(30);
  const range = useMemo(() => dateRange(days), [days]);
  const report = useQuery({ queryKey: ["provider-cost", range], queryFn: () => api.getCostReport(range.from, range.to) });
  const highestInstance = report.data?.byInstance[0];
  const highestModel = report.data?.byModel[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Model cost"
        description="LiteLLM spend is attributed to the dedicated virtual key created for each Instance, then grouped by Instance and registered model Endpoint."
        actions={<div className="flex items-center gap-2"><CalendarDays className="size-4 text-muted-foreground" /><Select value={String(days)} onValueChange={(value) => setDays(Number(value))}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="7">Last 7 days</SelectItem><SelectItem value="30">Last 30 days</SelectItem><SelectItem value="90">Last 90 days</SelectItem></SelectContent></Select></div>}
      />

      {report.isLoading ? <div className="flex min-h-56 items-center justify-center gap-3 border text-sm text-muted-foreground"><Spinner />Loading LiteLLM spend logs…</div> : report.error ? <div role="alert" className="border-l-2 border-destructive bg-destructive/5 p-4"><strong className="text-sm text-destructive">Cost data unavailable</strong><p className="mt-1 text-xs leading-5 text-muted-foreground">{report.error.message}</p></div> : report.data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Total spend" value={money(report.data.totalSpend)} />
            <MetricCard label="Requests" value={report.data.requestCount.toLocaleString()} />
            <MetricCard label="Highest-cost Instance" value={<MetricIdentity item={highestInstance} empty="No spend" />} />
            <MetricCard label="Highest-cost model" value={<MetricIdentity item={highestModel} empty="No spend" />} />
          </div>
          <div className="grid gap-5 xl:grid-cols-2">
            <BreakdownCard icon={Bot} title="Spend by Instance key" description="Each row maps to a virtual key whose user_id is the Agent ID." items={report.data.byInstance} />
            <BreakdownCard icon={Cpu} title="Spend by model Endpoint" description="Model groups resolve back to Provider Account and Endpoint." items={report.data.byModel} />
          </div>
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><ReceiptText className="size-4" />Daily spend</CardTitle><CardDescription>{report.data.from} — {report.data.to}</CardDescription></CardHeader><CardContent>{report.data.daily.length ? <div className="flex h-44 items-end gap-2 border-b border-l px-3 pt-4">{report.data.daily.map((point) => { const max = Math.max(...report.data.daily.map((item) => item.spend), 0.000001); return <div key={point.date} className="group relative flex h-full min-w-0 flex-1 items-end"><div className="w-full bg-primary/75 transition-colors hover:bg-primary" style={{ height: `${Math.max(3, (point.spend / max) * 100)}%` }} title={`${point.date}: ${money(point.spend)}`} /></div>; })}</div> : <EmptyCost />}</CardContent></Card>
        </>
      ) : null}
    </div>
  );
}

function MetricIdentity({ item, empty }: { item: CostBreakdownItem | undefined; empty: string }) {
  return <span className="block min-w-0"><span className="block truncate text-base">{item?.label ?? empty}</span>{item ? <span className="mt-1 block text-sm font-normal text-muted-foreground">{money(item.spend)}</span> : null}</span>;
}

function BreakdownCard({ icon: Icon, title, description, items }: { icon: typeof Banknote; title: string; description: string; items: CostBreakdownItem[] }) {
  const max = items[0]?.spend ?? 0;
  return <Card><CardHeader><CardTitle className="flex items-center gap-2"><Icon className="size-4" />{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent>{items.length ? <div className="space-y-4">{items.slice(0, 10).map((item) => <div key={item.id}><div className="flex items-start justify-between gap-4 text-xs"><span className="min-w-0"><strong className="block truncate text-sm">{item.label}</strong><span className="block truncate text-muted-foreground">{item.detail} · {item.requests} requests</span></span><strong>{money(item.spend)}</strong></div><div className="mt-2 h-1.5 bg-muted"><div className="h-full bg-primary" style={{ width: `${max ? Math.max(2, (item.spend / max) * 100) : 0}%` }} /></div></div>)}</div> : <EmptyCost />}</CardContent></Card>;
}

function EmptyCost() {
  return <div className="grid min-h-32 place-items-center border border-dashed text-center"><div><Banknote className="mx-auto size-5 text-muted-foreground" /><p className="mt-2 text-sm font-medium">No spend in this period</p><p className="mt-1 text-xs text-muted-foreground">Usage appears after an Instance calls a model through its LiteLLM key.</p></div></div>;
}
