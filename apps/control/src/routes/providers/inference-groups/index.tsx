import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { InferenceCapabilityState, InferenceGroup, InferenceGroupStatus } from "@tasklattice/contracts";
import { Activity, ArrowRight, Boxes, CheckCircle2, CircleAlert, Plus, RefreshCw, Route as RouteIcon, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/providers/inference-groups/")({ component: InferenceGroupsPage });

function InferenceGroupsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const queryClient = useQueryClient();
  const groups = useQuery({ queryKey: ["inference-groups"], queryFn: api.listInferenceGroups });
  const refresh = useMutation({
    mutationFn: api.refreshInferenceGroup,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["inference-groups"] }),
  });
  const data = groups.data ?? [];
  return <div className="space-y-6">
    <PageHeader
      title="Inference Groups"
      description="Stable inference access contracts backed by routing managed in LiteLLM."
      actions={<Button className="h-11" onClick={() => setCreateOpen(true)}><Plus />Create inference group</Button>}
    />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard icon={RouteIcon} label="Inference groups" value={data.length} />
      <MetricCard icon={CheckCircle2} label="Ready" value={data.filter((group) => group.status === "READY").length} />
      <MetricCard icon={Boxes} label="Consumers" value={data.reduce((sum, group) => sum + group.consumers, 0)} />
      <MetricCard icon={ShieldCheck} label="Compliant" value={data.filter((group) => group.conditions.some((condition) => condition.type === "COMPLIANCE" && condition.status === "PASS")).length} />
    </div>
    {groups.isPending ? <div className="grid min-h-56 place-items-center border text-sm text-muted-foreground">Loading inference access contracts…</div>
      : groups.error ? <div role="alert" className="border-l-2 border-destructive bg-destructive/5 p-4 text-sm text-destructive">{groups.error.message}</div>
      : data.length ? <div className="grid gap-4 lg:grid-cols-2">{data.map((group) => <GroupCard key={group.id} group={group} refreshing={refresh.isPending && refresh.variables === group.id} onRefresh={() => refresh.mutate(group.id)} />)}</div>
      : <Card><CardContent className="flex min-h-64 flex-col items-center justify-center text-center"><RouteIcon className="size-8 text-muted-foreground" /><h2 className="mt-4 text-base font-semibold">No inference access contract</h2><p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">Register an existing LiteLLM model alias. TaskLattice will inspect its routing, failover, audit, and compliance metadata without copying the router configuration.</p><Button className="mt-5" onClick={() => setCreateOpen(true)}><Plus />Create inference group</Button></CardContent></Card>}
    <CreateGroupDialog open={createOpen} onOpenChange={setCreateOpen} />
  </div>;
}

function GroupCard({ group, onRefresh, refreshing }: { group: InferenceGroup; onRefresh: () => void; refreshing: boolean }) {
  return <Card className="overflow-hidden"><CardContent className="p-0">
    <div className="flex items-start gap-4 p-5">
      <span className="grid size-11 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><RouteIcon className="size-5" /></span>
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{group.name}</h2>{group.isDefault ? <span className="rounded-full border bg-muted px-2 py-0.5 text-[11px] font-medium">Default</span> : null}<Status status={group.status} /></div><p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{group.description || "LiteLLM-managed inference access contract."}</p></div>
      <Button size="icon" variant="ghost" aria-label={`Refresh ${group.name}`} disabled={refreshing} onClick={onRefresh}><RefreshCw className={cn(refreshing && "animate-spin")} /></Button>
    </div>
    <div className="grid grid-cols-2 gap-px border-y bg-border text-xs sm:grid-cols-4">
      <Fact label="Compliance" value={group.complianceDomain === "CN_MAINLAND" ? "CN Mainland" : "Global"} />
      <Fact label="Auto routing" value={capability(group.capabilities.automaticRouting)} />
      <Fact label="Failover" value={capability(group.capabilities.failover)} />
      <Fact label="Consumers" value={String(group.consumers)} />
    </div>
    <div className="flex items-center justify-between gap-3 p-4 text-xs text-muted-foreground"><span>{group.lastSynchronizedAt ? `Synchronized ${new Date(group.lastSynchronizedAt).toLocaleString()}` : "Not synchronized"}</span><Button asChild variant="ghost" size="sm"><Link to="/providers/inference-groups/$groupId" params={{ groupId: group.id }}>Open details <ArrowRight /></Link></Button></div>
  </CardContent></Card>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="bg-background px-4 py-3"><span className="block text-muted-foreground">{label}</span><strong className="mt-1 block font-medium">{value}</strong></div>;
}

export function Status({ status }: { status: InferenceGroupStatus }) {
  const ready = status === "READY";
  const warning = status === "DEGRADED" || status === "DRAFT" || status === "VALIDATING";
  return <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", ready ? "text-emerald-700" : warning ? "text-amber-700" : "text-destructive")}><span className={cn("size-1.5 rounded-full", ready ? "bg-emerald-500" : warning ? "bg-amber-500" : "bg-current")} />{status.replaceAll("_", " ")}</span>;
}

function capability(value: InferenceCapabilityState): string {
  return value === "ENABLED" ? "Enabled" : value === "DISABLED" ? "Disabled" : "Not reported";
}

function CreateGroupDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const gateways = useQuery({ queryKey: ["inference-gateways"], queryFn: api.listInferenceGateways, enabled: open });
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [alias, setAlias] = useState("");
  const [makeDefault, setMakeDefault] = useState(true);
  const [attempted, setAttempted] = useState(false);
  const mutation = useMutation({
    mutationFn: () => api.createInferenceGroup({ name, description, gatewayId: gateways.data?.[0]?.id ?? "", publicModelAlias: alias, complianceDomain: gateways.data?.[0]?.complianceDomain ?? "GLOBAL", isDefault: makeDefault, keyPolicy: { perInstance: true, rotationDays: 90 }, auditPolicy: { controlPlane: true, requestLogs: true, capturePrompts: false } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["inference-groups"] });
      setName("");
      setDescription("");
      setAlias("");
      setAttempted(false);
      onOpenChange(false);
    },
  });
  const nameValid = name.trim().length >= 2;
  const aliasValid = alias.trim().length > 0;
  const gatewayAvailable = Boolean(gateways.data?.length);
  const submit = () => {
    setAttempted(true);
    if (!nameValid || !aliasValid || !gatewayAvailable) return;
    mutation.mutate();
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-xl"><DialogHeader><DialogTitle>Create inference group</DialogTitle><DialogDescription>Bind a stable TaskLattice access contract to routing already configured in LiteLLM.</DialogDescription></DialogHeader>
    <div className="min-h-0 space-y-5 overflow-y-auto px-6 py-5">
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="ig-name">Name</Label>
          <Input id="ig-name" value={name} aria-invalid={attempted && !nameValid} aria-describedby="ig-name-help" onChange={(event) => setName(event.target.value)} placeholder="CN production inference" />
          <p id="ig-name-help" className={cn("min-h-5 text-xs leading-5", attempted && !nameValid ? "text-destructive" : "text-muted-foreground")}>{attempted && !nameValid ? "Enter at least 2 characters." : "2–64 characters."}</p>
        </div>
        <div className="space-y-2">
          <Label>LiteLLM Gateway</Label>
          <div className="flex h-11 items-center border bg-muted/30 px-3 text-sm">{gateways.isPending ? "Loading…" : gateways.data?.[0]?.name ?? "Unavailable"}</div>
          <p className={cn("min-h-5 text-xs leading-5", !gateways.isPending && !gatewayAvailable ? "text-destructive" : "text-muted-foreground")}>{!gateways.isPending && !gatewayAvailable ? "Configure a Gateway before creating a group." : "Managed by the platform."}</p>
        </div>
      </div>
      <div className="space-y-2"><Label htmlFor="ig-description">Description</Label><Textarea id="ig-description" className="min-h-24" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Shared inference for production Instances" /></div>
      <div className="space-y-2"><Label htmlFor="ig-alias">Public model alias</Label><Input id="ig-alias" value={alias} aria-invalid={attempted && !aliasValid} aria-describedby="ig-alias-help" onChange={(event) => setAlias(event.target.value)} placeholder="production-chat" /><p id="ig-alias-help" className={cn("text-xs leading-5", attempted && !aliasValid ? "text-destructive" : "text-muted-foreground")}>{attempted && !aliasValid ? "Enter the existing LiteLLM public model alias." : "TaskLattice validates this alias but does not own its routing rules."}</p></div>
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label>Compliance domain</Label><div className="flex h-11 items-center border bg-muted/30 px-3 text-sm">{gateways.data?.[0]?.complianceDomain === "CN_MAINLAND" ? "CN Mainland" : "Global"}</div><p className="min-h-5 text-xs leading-5 text-muted-foreground">Inherited from the isolated Gateway.</p></div>
        <div className="space-y-2"><Label>Instance assignment</Label><button type="button" aria-pressed={makeDefault} className={cn("flex h-11 w-full items-center gap-2 border px-3 text-left text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary", makeDefault && "border-primary bg-primary/5")} onClick={() => setMakeDefault((value) => !value)}><span className={cn("grid size-5 shrink-0 place-items-center rounded-full border", makeDefault && "border-primary bg-primary text-primary-foreground")}><CheckCircle2 className="size-3.5" /></span>Default for new Instances</button><p className="min-h-5 text-xs leading-5 text-muted-foreground">{makeDefault ? "Applied automatically." : "Not selected by default."}</p></div>
      </div>
      <div className="flex gap-3 border-l-2 border-primary bg-primary/5 p-3 text-xs leading-5"><Activity className="mt-0.5 size-4 shrink-0 text-primary" /><span>Complexity routing, session affinity, adaptive routing, fallbacks, retries, and request audit are detected from LiteLLM after validation. They are not configured here.</span></div>
      {mutation.error ? <p role="alert" className="flex gap-2 text-xs text-destructive"><CircleAlert className="size-4" />{mutation.error.message}</p> : null}
    </div>
    <DialogFooter className="gap-3"><Button className="w-full sm:w-auto sm:min-w-32" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button className="w-full sm:w-auto sm:min-w-44" disabled={mutation.isPending || gateways.isPending || !gatewayAvailable} onClick={submit}>{mutation.isPending ? "Validating binding…" : "Create and validate"}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
