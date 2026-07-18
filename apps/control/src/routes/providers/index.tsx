import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { providerPresets, type ModelDeployment, type ProviderAccount, type ProviderResourceStatus } from "@tasklattice/contracts";
import { Boxes, Cable, ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign, Ellipsis, Plus, RefreshCw, Search, Server, ShieldCheck, Trash2 } from "lucide-react";
import { ProviderIcon } from "@/components/providers/provider-icon";
import { ProviderRegistrationDrawer } from "@/components/providers/provider-registration-drawer";
import { EmptyState } from "@/components/shared/empty-state";
import { MetricCard } from "@/components/shared/metric-card";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/providers/")({ component: ProvidersPage });
const pageSize = 10;

function dateRange(days: number) {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - days + 1);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function money(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function ProvidersPage() {
  const [registerOpen, setRegisterOpen] = useState(false);
  const [drawerAccount, setDrawerAccount] = useState<ProviderAccount>();
  const addProviderButtonRef = useRef<HTMLButtonElement>(null);
  const restoreAddProviderFocus = useRef(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | ProviderResourceStatus>("all");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string>();
  const accounts = useQuery({ queryKey: ["provider-accounts"], queryFn: api.listProviderAccounts });
  const models = useQuery({ queryKey: ["model-deployments"], queryFn: api.listModelDeployments });
  const range = useMemo(() => dateRange(30), []);
  const costs = useQuery({ queryKey: ["provider-cost", range], queryFn: () => api.getCostReport(range.from, range.to), retry: false });
  const validatedModels = (models.data ?? []).filter((model) => model.status === "VALIDATED");
  const spend = new Map((costs.data?.byProviderAccount ?? []).map((item) => [item.id, item.spend]));
  const filtered = useMemo(() => (accounts.data ?? []).filter((account) => {
    const query = search.trim().toLowerCase();
    const provider = providerPresets.find((item) => item.id === account.providerKind)?.name ?? account.providerKind;
    return (status === "all" || account.status === status) && (!query || `${account.name} ${provider} ${account.endpoint}`.toLowerCase().includes(query));
  }), [accounts.data, search, status]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => setPage(1), [search, status]);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);
  useEffect(() => {
    if (registerOpen || !restoreAddProviderFocus.current) return;
    const timer = window.setTimeout(() => {
      addProviderButtonRef.current?.focus();
      restoreAddProviderFocus.current = false;
    }, 350);
    return () => window.clearTimeout(timer);
  }, [registerOpen]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Providers"
        description="Manage Provider connections and the models available through your LiteLLM Gateway."
        actions={<Button ref={addProviderButtonRef} className="h-11" onClick={() => { restoreAddProviderFocus.current = true; setDrawerAccount(undefined); setRegisterOpen(true); }}><Plus />Add provider connection</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Cable} label="Provider connections" value={accounts.data?.length ?? 0} />
        <MetricCard icon={Boxes} label="Active models" value={validatedModels.length} />
        <MetricCard icon={ShieldCheck} label="Healthy" value={<span className="inline-flex items-center gap-2">{(accounts.data ?? []).filter((account) => account.status === "VALIDATED").length}<span className="size-2 rounded-full bg-emerald-500" /></span>} />
        <MetricCard icon={CircleDollarSign} label="Total spend (30d)" value={costs.isLoading ? <Spinner /> : costs.data ? money(costs.data.totalSpend) : "—"} />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative max-w-lg flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" aria-label="Search Provider connections" placeholder="Search connections…" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}><SelectTrigger className="w-full sm:w-44" aria-label="Filter by status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="VALIDATED">Healthy</SelectItem><SelectItem value="DEGRADED">Degraded</SelectItem><SelectItem value="FAILED">Failed</SelectItem></SelectContent></Select>
      </div>

      {accounts.isLoading || models.isLoading ? (
        <div className="flex min-h-56 items-center justify-center gap-3 border text-sm text-muted-foreground"><Spinner />Loading Provider registry…</div>
      ) : accounts.error || models.error ? (
        <div role="alert" className="border-l-2 border-destructive bg-destructive/5 p-4 text-sm text-destructive">{accounts.error?.message ?? models.error?.message}</div>
      ) : accounts.data?.length ? (
        <Card className="overflow-hidden"><CardContent className="p-0">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="border-b bg-muted/30 text-xs text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Connection</th><th className="px-4 py-3 font-medium">Provider</th><th className="px-4 py-3 font-medium">Models</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Last checked</th><th className="px-4 py-3 text-right font-medium">Spend (30d)</th><th className="w-14"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody className="divide-y">{visible.map((account) => { const accountModels = (models.data ?? []).filter((model) => model.providerAccountId === account.id); const isExpanded = expanded === account.id; return <Fragment key={account.id}><tr className="hover:bg-muted/20"><td className="px-4 py-3"><button className="flex min-w-0 items-center gap-3 text-left" onClick={() => setExpanded(isExpanded ? undefined : account.id)} aria-expanded={isExpanded}><ProviderIcon presetId={account.presetId} className="size-10 [&_img]:size-6" /><span className="min-w-0"><strong className="block truncate">{account.name}</strong><span className="mt-0.5 block text-xs text-muted-foreground">Created {new Date(account.createdAt).toLocaleDateString()}</span></span><ChevronDown className={cn("size-4 text-muted-foreground transition-transform", isExpanded && "rotate-180")} /></button></td><td className="px-4 py-3 text-xs">{providerPresets.find((item) => item.id === account.providerKind)?.name ?? account.providerKind}</td><td className="px-4 py-3 font-mono text-xs">{accountModels.filter((model) => model.status === "VALIDATED").length}</td><td className="px-4 py-3"><StatusBadge status={account.status} /></td><td className="px-4 py-3 text-xs text-muted-foreground">{relativeTime(account.validatedAt ?? account.updatedAt)}</td><td className="px-4 py-3 text-right font-medium">{costs.data ? money(spend.get(account.id) ?? 0) : "—"}</td><td className="px-2 py-3"><AccountActions account={account} onAddModel={() => { setDrawerAccount(account); setRegisterOpen(true); }} /></td></tr>{isExpanded ? <tr><td colSpan={7} className="bg-muted/10 px-5 py-4"><AccountDetails account={account} models={accountModels} /></td></tr> : null}</Fragment>; })}</tbody>
            </table>
          </div>
          <div className="divide-y md:hidden">{visible.map((account) => <MobileAccountCard key={account.id} account={account} models={(models.data ?? []).filter((model) => model.providerAccountId === account.id)} spend={costs.data ? spend.get(account.id) ?? 0 : undefined} onAddModel={() => { setDrawerAccount(account); setRegisterOpen(true); }} />)}</div>
          {!visible.length ? <div className="p-8 text-center text-sm text-muted-foreground">No connections match the current filters.</div> : null}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-xs text-muted-foreground"><span>Showing {filtered.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, filtered.length)} of {filtered.length} connections</span><div className="flex items-center gap-2"><Button size="icon" variant="outline" aria-label="Previous page" disabled={page === 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft /></Button><span className="grid size-9 place-items-center bg-primary font-medium text-primary-foreground">{page}</span><Button size="icon" variant="outline" aria-label="Next page" disabled={page === pageCount} onClick={() => setPage((value) => value + 1)}><ChevronRight /></Button></div></div>
        </CardContent></Card>
      ) : (
        <Card><CardContent><EmptyState icon={Server} title="No Provider connections" description="Connect a Provider, discover its models, and register at least one model in LiteLLM." /></CardContent></Card>
      )}

      <ProviderRegistrationDrawer open={registerOpen} onOpenChange={setRegisterOpen} initialAccount={drawerAccount} />
    </div>
  );
}

function StatusBadge({ status }: { status: ProviderResourceStatus }) {
  const label = status === "VALIDATED" ? "Healthy" : status === "DEGRADED" ? "Degraded" : "Failed";
  return <span className={cn("inline-flex items-center gap-2 text-xs font-medium", status === "VALIDATED" && "text-emerald-700", status === "DEGRADED" && "text-amber-700", status === "FAILED" && "text-destructive")}><span className={cn("size-1.5 rounded-full", status === "VALIDATED" ? "bg-emerald-500" : status === "DEGRADED" ? "bg-amber-500" : "bg-current")} />{label}</span>;
}

function AccountActions({ account, onAddModel }: { account: ProviderAccount; onAddModel: () => void }) {
  const queryClient = useQueryClient();
  const revalidate = useMutation({ mutationFn: () => api.revalidateProviderAccount(account.id), onSuccess: async () => Promise.all([queryClient.invalidateQueries({ queryKey: ["provider-accounts"] }), queryClient.invalidateQueries({ queryKey: ["model-deployments"] })]) });
  const remove = useMutation({ mutationFn: () => api.deleteProviderAccount(account.id), onSuccess: async () => Promise.all([queryClient.invalidateQueries({ queryKey: ["provider-accounts"] }), queryClient.invalidateQueries({ queryKey: ["model-deployments"] })]) });
  return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Actions for ${account.name}`}>{revalidate.isPending || remove.isPending ? <Spinner /> : <Ellipsis />}</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={onAddModel}><Plus />Add model</DropdownMenuItem><DropdownMenuItem onSelect={() => revalidate.mutate()} disabled={revalidate.isPending}><RefreshCw />Revalidate</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive focus:text-destructive" disabled={remove.isPending} onSelect={() => { if (window.confirm(`Delete ${account.name} and its model configurations?`)) remove.mutate(); }}><Trash2 />Delete connection</DropdownMenuItem></DropdownMenuContent></DropdownMenu>;
}

function AccountDetails({ account, models }: { account: ProviderAccount; models: ModelDeployment[] }) {
  return <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,1.4fr)]"><div><p className="text-xs leading-5 text-muted-foreground">{account.validationMessage}</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{account.checks.map((check) => <div key={check.id} className="flex min-h-10 items-center justify-between border bg-background px-3 text-xs"><span>{check.label}</span><strong className={cn(check.status === "PASS" && "text-emerald-600", check.status === "FAIL" && "text-destructive", check.status === "SKIP" && "text-muted-foreground")}>{check.status}</strong></div>)}</div></div><div><h3 className="mb-2 text-xs font-semibold">Registered models</h3>{models.length ? <div className="divide-y border bg-background">{models.map((model) => <div key={model.id} className="flex min-h-12 items-center justify-between gap-3 px-3 py-2"><span className="min-w-0"><strong className="block truncate text-xs">{model.displayName}</strong><span className="block truncate font-mono text-xs text-muted-foreground">{model.modelId}</span></span><StatusBadge status={model.status} /></div>)}</div> : <p className="border bg-background p-3 text-xs text-muted-foreground">No models registered.</p>}</div></div>;
}

function MobileAccountCard({ account, models, onAddModel, spend }: { account: ProviderAccount; models: ModelDeployment[]; onAddModel: () => void; spend?: number | undefined }) {
  const [open, setOpen] = useState(false);
  return <article className="p-4"><div className="flex items-start gap-3"><ProviderIcon presetId={account.presetId} className="size-10 [&_img]:size-6" /><div className="min-w-0 flex-1"><strong className="block truncate">{account.name}</strong><span className="text-xs text-muted-foreground">{providerPresets.find((item) => item.id === account.providerKind)?.name ?? account.providerKind}</span></div><AccountActions account={account} onAddModel={onAddModel} /></div><div className="mt-4 grid grid-cols-3 gap-3 text-xs"><span><span className="block text-muted-foreground">Models</span><strong>{models.length}</strong></span><span><span className="block text-muted-foreground">Spend</span><strong>{spend === undefined ? "—" : money(spend)}</strong></span><span><span className="block text-muted-foreground">Status</span><StatusBadge status={account.status} /></span></div><Button variant="ghost" className="mt-3 w-full justify-between" onClick={() => setOpen((value) => !value)}>Connection details<ChevronDown className={cn("transition-transform", open && "rotate-180")} /></Button>{open ? <div className="mt-3"><AccountDetails account={account} models={models} /></div> : null}</article>;
}

function relativeTime(value: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(value).toLocaleDateString();
}
