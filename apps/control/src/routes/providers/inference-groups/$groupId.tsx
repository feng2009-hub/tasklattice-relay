import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import type { InferenceGroup } from "@tasklattice/contracts";
import { Activity, ArrowLeft, Bot, Boxes, Check, CheckCircle2, CircleAlert, ExternalLink, FileClock, KeyRound, RefreshCw, Route as RouteIcon, ShieldCheck, Trash2 } from "lucide-react";
import { Status } from "./index";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/providers/inference-groups/$groupId")({ component: InferenceGroupDetailPage });
type Tab = "overview" | "settings" | "consumers" | "audit";

function InferenceGroupDetailPage() {
  const { groupId } = Route.useParams();
  const [tab, setTab] = useState<Tab>("overview");
  const queryClient = useQueryClient();
  const group = useQuery({ queryKey: ["inference-group", groupId], queryFn: () => api.getInferenceGroup(groupId) });
  const gateways = useQuery({ queryKey: ["inference-gateways"], queryFn: api.listInferenceGateways });
  const validate = useMutation({ mutationFn: () => api.refreshInferenceGroup(groupId), onSuccess: async () => Promise.all([queryClient.invalidateQueries({ queryKey: ["inference-group", groupId] }), queryClient.invalidateQueries({ queryKey: ["inference-groups"] })]) });
  if (group.isPending) return <div className="grid min-h-72 place-items-center text-sm text-muted-foreground">Loading Inference Group…</div>;
  if (group.error || !group.data) return <div role="alert" className="border-l-2 border-destructive bg-destructive/5 p-4 text-sm text-destructive">{group.error?.message ?? "Inference Group not found."}</div>;
  const current = group.data;
  const gateway = gateways.data?.find((item) => item.id === current.gatewayId);
  const ready = current.status === "READY";
  const passingChecks = current.conditions.filter((condition) => condition.status === "PASS").length;
  return <div className="space-y-6">
    <div><Button asChild variant="ghost" size="sm" className="-ml-3 mb-3"><Link to="/providers/inference-groups"><ArrowLeft />Inference Groups</Link></Button><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold tracking-tight">{current.name}</h1><Status status={current.status} />{current.isDefault ? <span className="rounded-full border bg-muted px-2 py-0.5 text-xs">Default</span> : null}</div><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{current.description || "LiteLLM-managed inference access contract."}</p></div><div className="flex gap-2"><Button variant="outline" disabled={validate.isPending} onClick={() => validate.mutate()}><RefreshCw className={cn(validate.isPending && "animate-spin")} />Refresh</Button>{gateway ? <Button asChild variant="outline"><a href={gateway.adminUiUrl} target="_blank" rel="noreferrer">Open in LiteLLM <ExternalLink /></a></Button> : null}</div></div></div>
    <section role="status" className={cn("flex flex-col gap-5 border-l-4 p-5 sm:flex-row sm:items-center sm:justify-between", ready ? "border-l-emerald-500 bg-emerald-500/5" : "border-l-amber-500 bg-amber-500/5")}>
      <div className="flex min-w-0 gap-3">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", ready ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700")}>{ready ? <CheckCircle2 className="size-5" /> : <CircleAlert className="size-5" />}</span>
        <div><h2 className="font-semibold">{ready ? "Configured correctly and ready for Instances" : "Not ready for new Instances"}</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{ready ? `${current.publicModelAlias} passed ${passingChecks} LiteLLM gateway, compliance, and capability checks. TaskLattice will create an isolated Virtual Key when an Instance uses this group.` : current.validationMessage}</p></div>
      </div>
      {ready ? <Button asChild className="min-h-11 shrink-0"><Link to="/agents/instace/new" search={{ inferenceGroupId: current.id }}><Bot />Use in new Instance</Link></Button> : <Button className="min-h-11 shrink-0" disabled><CircleAlert />Resolve before use</Button>}
    </section>
    <nav aria-label="Inference Group detail" className="flex gap-1 overflow-x-auto border-b">{(["overview", "settings", "consumers", "audit"] as const).map((item) => <button key={item} className={cn("min-h-11 shrink-0 border-b-2 px-4 text-sm capitalize", tab === item ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")} onClick={() => setTab(item)}>{item}</button>)}</nav>
    {validate.error ? <p role="alert" className="border-l-2 border-destructive bg-destructive/5 p-3 text-sm text-destructive">{validate.error.message}</p> : null}
    {tab === "overview" ? <Overview group={current} {...(gateway?.name ? { gatewayName: gateway.name } : {})} /> : null}
    {tab === "settings" ? <SettingsTab group={current} /> : null}
    {tab === "consumers" ? <ConsumersTab groupId={current.id} /> : null}
    {tab === "audit" ? <AuditTab groupId={current.id} /> : null}
  </div>;
}

function Overview({ group, gatewayName }: { group: InferenceGroup; gatewayName?: string }) {
  const capabilities = [
    ["Automatic routing", group.capabilities.automaticRouting],
    ["Session affinity", group.capabilities.sessionAffinity],
    ["Adaptive routing", group.capabilities.adaptiveRouting],
    ["Provider failover", group.capabilities.failover],
    ["Context fallback", group.capabilities.contextWindowFallback],
    ["Content policy fallback", group.capabilities.contentPolicyFallback],
    ["Retries", group.capabilities.retries],
    ["Request audit", group.capabilities.requestAudit],
  ] as const;
  return <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
    <div className="space-y-4"><Card><CardHeader><CardTitle className="flex items-center gap-2"><RouteIcon className="size-5" />Access contract</CardTitle><CardDescription>Stable values injected into every consuming Instance.</CardDescription></CardHeader><CardContent className="grid gap-px overflow-hidden border bg-border sm:grid-cols-2"><Fact label="Inference mode" value="Platform managed" /><Fact label="Public model alias" value={group.publicModelAlias} mono /><Fact label="Compliance" value={group.complianceDomain === "CN_MAINLAND" ? "CN Mainland" : "Global"} /><Fact label="Gateway" value={gatewayName ?? "Managed gateway"} /></CardContent></Card>
      <Card><CardHeader><CardTitle>Enabled capabilities</CardTitle><CardDescription>Read-only capability summary detected from LiteLLM.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">{capabilities.map(([label, state]) => <div key={label} className="flex min-h-12 items-center gap-3 border px-3 text-sm"><span className={cn("grid size-6 place-items-center rounded-full", state === "ENABLED" ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground")}>{state === "ENABLED" ? <Check className="size-4" /> : <Activity className="size-4" />}</span><span><strong className="block text-xs">{label}</strong><span className="text-xs text-muted-foreground">{state === "ENABLED" ? "Enabled in LiteLLM" : state === "DISABLED" ? "Not enabled" : "Not reported"}</span></span></div>)}</CardContent></Card></div>
    <div className="space-y-4"><Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="size-5" />Inference health</CardTitle><CardDescription>Fail-closed validation conditions.</CardDescription></CardHeader><CardContent className="space-y-3">{group.conditions.length ? group.conditions.map((condition) => <div key={condition.type} className="flex gap-3 border-b pb-3 last:border-0 last:pb-0"><span className={cn("mt-1 size-2 shrink-0 rounded-full", condition.status === "PASS" ? "bg-emerald-500" : condition.status === "UNKNOWN" ? "bg-amber-500" : "bg-destructive")} /><span><strong className="block text-xs">{condition.type}</strong><span className="mt-1 block text-xs leading-5 text-muted-foreground">{condition.reason}</span></span></div>) : <p className="text-sm text-muted-foreground">Validate the binding to populate health conditions.</p>}</CardContent></Card>
      <Card><CardHeader><CardTitle>Operational status</CardTitle></CardHeader><CardContent className="space-y-3"><FactRow label="Consumers" value={String(group.consumers)} /><FactRow label="Control-plane audit" value="Enabled" /><FactRow label="Configuration source" value="LiteLLM" /><FactRow label="Last synchronized" value={group.lastSynchronizedAt ? new Date(group.lastSynchronizedAt).toLocaleString() : "Never"} /><FactRow label="LiteLLM version" value={group.liteLLMVersion ?? "Not reported"} /></CardContent></Card></div>
  </div>;
}

function SettingsTab({ group }: { group: InferenceGroup }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description);
  useEffect(() => { setName(group.name); setDescription(group.description); }, [group]);
  const update = useMutation({ mutationFn: (input: Parameters<typeof api.updateInferenceGroup>[1]) => api.updateInferenceGroup(group.id, input), onSuccess: async () => Promise.all([queryClient.invalidateQueries({ queryKey: ["inference-group", group.id] }), queryClient.invalidateQueries({ queryKey: ["inference-groups"] })]) });
  const remove = useMutation({ mutationFn: () => api.deleteInferenceGroup(group.id), onSuccess: () => navigate({ to: "/providers/inference-groups" }) });
  return <div className="space-y-4"><SettingsCard title="General" description="Human-readable identity for this access contract."><div className="grid gap-4 sm:grid-cols-2"><Field label="Name"><Input value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label="Description"><Textarea value={description} onChange={(event) => setDescription(event.target.value)} /></Field></div><Button className="mt-4" disabled={update.isPending} onClick={() => update.mutate({ name, description })}>Save changes</Button></SettingsCard>
    <SettingsCard title="LiteLLM binding" description="Routing policy remains owned and edited in LiteLLM."><div className="grid gap-4 sm:grid-cols-2"><ReadOnly label="Public model alias" value={group.publicModelAlias} /><ReadOnly label="Configuration source" value="Managed in LiteLLM" /></div><p className="mt-3 text-xs leading-5 text-muted-foreground">Automatic routing, fallback order, retries, budgets, and provider weights are intentionally not duplicated in TaskLattice.</p></SettingsCard>
    <SettingsCard title="Access credentials" description="Key material is never displayed or persisted by the TaskLattice API."><div className="flex items-center gap-3 border bg-muted/20 p-3"><KeyRound className="size-5 text-primary" /><span><strong className="block text-sm">Per-Instance Virtual Keys enabled</strong><span className="text-xs text-muted-foreground">Team-scoped · model-restricted · independently revocable</span></span></div></SettingsCard>
    <SettingsCard title="Compliance policy" description="The Inference Group inherits the isolated LiteLLM Gateway domain."><div className="max-w-sm"><ReadOnly label="Compliance domain" value={group.complianceDomain === "CN_MAINLAND" ? "CN Mainland" : "Global"} /></div><p className="mt-3 flex gap-2 text-xs text-muted-foreground"><CircleAlert className="size-4 shrink-0" />Every effective Router candidate must declare this same domain. A mismatch blocks new Instance bindings.</p></SettingsCard>
    <SettingsCard title="Audit policy" description="Control-plane events are always captured; request telemetry depends on LiteLLM callbacks."><div className="grid gap-3 sm:grid-cols-2"><ReadOnly label="Control-plane events" value="Enabled" /><ReadOnly label="Prompt and response capture" value="Disabled" /></div></SettingsCard>
    <SettingsCard title="Lifecycle" description="Suspension stops the group from resolving for new Instances."><Button variant="outline" onClick={() => { if (window.confirm(group.status === "SUSPENDED" ? "Resume this Inference Group?" : "Suspend this Inference Group?")) update.mutate({ suspended: group.status !== "SUSPENDED" }); }}>{group.status === "SUSPENDED" ? "Resume inference group" : "Suspend inference group"}</Button></SettingsCard>
    <Card className="border-destructive/30"><CardHeader><CardTitle className="text-destructive">Danger zone</CardTitle><CardDescription>Deletion is blocked while Consumers are attached.</CardDescription></CardHeader><CardContent><Button variant="destructive" disabled={group.consumers > 0 || remove.isPending} onClick={() => { if (window.confirm(`Permanently delete ${group.name}?`)) remove.mutate(); }}><Trash2 />Delete inference group</Button>{remove.error ? <p className="mt-3 text-xs text-destructive">{remove.error.message}</p> : null}</CardContent></Card>
    {update.error ? <p role="alert" className="text-sm text-destructive">{update.error.message}</p> : null}
  </div>;
}

function ConsumersTab({ groupId }: { groupId: string }) {
  const query = useQuery({ queryKey: ["inference-group-consumers", groupId], queryFn: () => api.listInferenceGroupConsumers(groupId) });
  return <Card><CardHeader><CardTitle className="flex items-center gap-2"><Boxes className="size-5" />Consumers</CardTitle><CardDescription>Instances with active, independently revocable Virtual Keys.</CardDescription></CardHeader><CardContent>{query.isPending ? <p className="text-sm text-muted-foreground">Loading consumers…</p> : query.data?.length ? <div className="divide-y border">{query.data.map((binding) => <div key={binding.id} className="grid gap-2 p-3 text-xs sm:grid-cols-3"><span><span className="block text-muted-foreground">Instance</span><strong>{binding.agentId}</strong></span><span><span className="block text-muted-foreground">Key fingerprint</span><strong className="font-mono">{binding.keyFingerprint}</strong></span><span><span className="block text-muted-foreground">Created</span><strong>{new Date(binding.createdAt).toLocaleString()}</strong></span></div>)}</div> : <p className="py-10 text-center text-sm text-muted-foreground">No active Consumers.</p>}</CardContent></Card>;
}

function AuditTab({ groupId }: { groupId: string }) {
  const query = useQuery({ queryKey: ["inference-group-audit", groupId], queryFn: () => api.listInferenceGroupAudit(groupId) });
  return <Card><CardHeader><CardTitle className="flex items-center gap-2"><FileClock className="size-5" />Control-plane audit</CardTitle><CardDescription>Secrets and prompt content are excluded.</CardDescription></CardHeader><CardContent>{query.isPending ? <p className="text-sm text-muted-foreground">Loading audit events…</p> : query.data?.length ? <ol className="divide-y border">{query.data.map((event) => <li key={event.eventId} className="grid gap-2 p-3 text-xs sm:grid-cols-[11rem_1fr_auto]"><span className="text-muted-foreground">{new Date(event.timestamp).toLocaleString()}</span><span><strong className="block">{event.type}</strong><span className="mt-1 block text-muted-foreground">{event.reason}</span></span><span className={event.result === "SUCCESS" ? "text-emerald-700" : "text-destructive"}>{event.result}</span></li>)}</ol> : <p className="py-10 text-center text-sm text-muted-foreground">No audit events.</p>}</CardContent></Card>;
}

function SettingsCard({ children, description, title }: { children: ReactNode; description: string; title: string }) { return <Card><CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent>{children}</CardContent></Card>; }
function Field({ children, label }: { children: ReactNode; label: string }) { return <div className="space-y-2"><Label>{label}</Label>{children}</div>; }
function ReadOnly({ label, value }: { label: string; value: string }) { return <div><Label>{label}</Label><div className="mt-2 flex min-h-10 items-center border bg-muted/30 px-3 text-sm">{value}</div></div>; }
function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) { return <div className="bg-background p-4"><span className="block text-xs text-muted-foreground">{label}</span><strong className={cn("mt-1 block text-sm", mono && "font-mono")}>{value}</strong></div>; }
function FactRow({ label, value }: { label: string; value: string }) { return <div className="flex items-start justify-between gap-4 text-xs"><span className="text-muted-foreground">{label}</span><strong className="text-right font-medium">{value}</strong></div>; }
