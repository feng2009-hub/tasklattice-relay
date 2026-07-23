import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { providerPresets, type InferenceGroup } from "@tasklattice/contracts";
import { Activity, ArrowLeft, ArrowRight, Bot, Boxes, Cable, Check, CheckCircle2, CircleAlert, Database, Ellipsis, ExternalLink, FileClock, KeyRound, RefreshCw, Route as RouteIcon, ShieldCheck, SlidersHorizontal, Trash2 } from "lucide-react";
import { Status } from "./index";
import { DeleteModelProfileDialog } from "@/components/providers/delete-model-profile-dialog";
import { ProviderIcon } from "@/components/providers/provider-icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/providers/inference-groups/$groupId")({ component: InferenceGroupDetailPage });
type Tab = "overview" | "routing" | "access" | "consumers" | "audit";

function InferenceGroupDetailPage() {
  const { groupId } = Route.useParams();
  const [tab, setTab] = useState<Tab>("overview");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const group = useQuery({ queryKey: ["inference-group", groupId], queryFn: () => api.getInferenceGroup(groupId) });
  const gateways = useQuery({ queryKey: ["inference-gateways"], queryFn: api.listInferenceGateways });
  const validate = useMutation({ mutationFn: () => api.refreshInferenceGroup(groupId), onSuccess: async () => Promise.all([queryClient.invalidateQueries({ queryKey: ["inference-group", groupId] }), queryClient.invalidateQueries({ queryKey: ["inference-groups"] })]) });
  const remove = useMutation({ mutationFn: () => api.deleteInferenceGroup(groupId), onSuccess: () => navigate({ to: "/providers/inference-groups" }) });
  if (group.isPending) return <div className="grid min-h-72 place-items-center text-sm text-muted-foreground">Loading Model Profile…</div>;
  if (group.error || !group.data) return <div role="alert" className="border-l-2 border-destructive bg-destructive/5 p-4 text-sm text-destructive">{group.error?.message ?? "Model Profile not found."}</div>;
  const current = group.data;
  const gateway = gateways.data?.find((item) => item.id === current.gatewayId);
  const ready = current.status === "READY";
  const passingChecks = current.conditions.filter((condition) => condition.status === "PASS").length;
  return <div className="space-y-6">
    <div><Button asChild variant="ghost" size="sm" className="-ml-3 mb-3"><Link to="/providers/inference-groups"><ArrowLeft />Model Profiles</Link></Button><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold tracking-tight">{current.name}</h1><Status status={current.status} />{current.isDefault ? <span className="border bg-muted px-2 py-0.5 text-xs">Default profile</span> : null}</div><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{current.description || "A reusable model, routing, and access profile."}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={validate.isPending} onClick={() => validate.mutate()}><RefreshCw className={cn(validate.isPending && "animate-spin")} />Refresh profile</Button>{gateway ? <Button asChild variant="outline"><a href={gateway.adminUiUrl} target="_blank" rel="noreferrer">Inspect routing <ExternalLink /></a></Button> : null}<DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label={`Actions for ${current.name}`}><Ellipsis /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => { remove.reset(); setDeleteOpen(true); }}><Trash2 />Delete Model Profile</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div></div></div>
    <section role="status" className={cn("flex flex-col gap-5 border-l-4 p-5 sm:flex-row sm:items-center sm:justify-between", ready ? "border-l-emerald-500 bg-emerald-500/5" : "border-l-amber-500 bg-amber-500/5")}>
      <div className="flex min-w-0 gap-3">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", ready ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700")}>{ready ? <CheckCircle2 className="size-5" /> : <CircleAlert className="size-5" />}</span>
        <div><h2 className="font-semibold">{ready ? "This Model Profile is ready for Instances" : "This Model Profile needs attention"}</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{ready ? `${current.publicModelAlias} passed ${passingChecks} routing, compliance, and access checks. Each Instance receives its own isolated Virtual Key.` : current.validationMessage}</p></div>
      </div>
      {ready ? <Button asChild className="min-h-11 shrink-0"><Link to="/agents/instace/new" search={{ inferenceGroupId: current.id }}><Bot />Use profile in new Instance</Link></Button> : <Button className="min-h-11 shrink-0" disabled title="Resolve the failed checks before assigning this profile"><CircleAlert />Unavailable for Instances</Button>}
    </section>
    <nav aria-label="Model Profile detail" className="flex gap-1 overflow-x-auto border-b">{([
      ["overview", "Overview"],
      ["routing", "Routing & upstream"],
      ["access", "Access & policy"],
      ["consumers", "Consumers"],
      ["audit", "Audit"],
    ] as const).map(([item, label]) => <button key={item} className={cn("min-h-11 shrink-0 border-b-2 px-4 text-sm", tab === item ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")} onClick={() => setTab(item)}>{label}</button>)}</nav>
    {validate.error ? <p role="alert" className="border-l-2 border-destructive bg-destructive/5 p-3 text-sm text-destructive">{validate.error.message}</p> : null}
    {tab === "overview" ? <Overview group={current} {...(gateway?.name ? { gatewayName: gateway.name } : {})} /> : null}
    {tab === "routing" ? <RoutingTab group={current} adminUiUrl={gateway?.adminUiUrl} /> : null}
    {tab === "access" ? <AccessTab group={current} onDelete={() => { remove.reset(); setDeleteOpen(true); }} /> : null}
    {tab === "consumers" ? <ConsumersTab groupId={current.id} /> : null}
    {tab === "audit" ? <AuditTab groupId={current.id} /> : null}
    <DeleteModelProfileDialog
      consumers={current.consumers}
      deleting={remove.isPending}
      {...(remove.error?.message ? { error: remove.error.message } : {})}
      onConfirm={() => remove.mutate()}
      onOpenChange={setDeleteOpen}
      onViewConsumers={() => setTab("consumers")}
      open={deleteOpen}
      profileName={current.name}
    />
  </div>;
}

function Overview({ group, gatewayName }: { group: InferenceGroup; gatewayName?: string }) {
  return <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
    <div className="space-y-4">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><SlidersHorizontal className="size-5" />Profile contract</CardTitle><CardDescription>The stable model identity and guardrails every consumer receives.</CardDescription></CardHeader><CardContent className="grid gap-px overflow-hidden border bg-border sm:grid-cols-2"><Fact label="Public model alias" value={group.publicModelAlias} mono /><Fact label="Routing mode" value={group.capabilities.automaticRouting === "ENABLED" ? "Automatic" : "LiteLLM managed"} /><Fact label="Compliance boundary" value={group.complianceDomain === "CN_MAINLAND" ? "CN Mainland" : "Global"} /><Fact label="Access isolation" value="Virtual Key per Instance" /></CardContent></Card>
      <Card><CardHeader><CardTitle>Inference path</CardTitle><CardDescription>One Model Profile connects the complete upstream-to-consumer path.</CardDescription></CardHeader><CardContent>
        <div className="grid border sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-stretch">
          <PathStep icon={Database} label="Upstream pool" value="Provider models" />
          <PathArrow />
          <PathStep icon={RouteIcon} label="Routing identity" value={group.publicModelAlias} mono />
          <PathArrow />
          <PathStep icon={KeyRound} label="Consumer access" value={`${group.consumers} Instance${group.consumers === 1 ? "" : "s"}`} />
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">Provider credentials and model deployments feed the LiteLLM resource pool. The exact candidate set is managed by the public alias and is not duplicated in TaskLattice.</p>
      </CardContent></Card>
    </div>
    <div className="space-y-4"><Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="size-5" />Profile readiness</CardTitle><CardDescription>Fail-closed checks across routing, compliance, and access.</CardDescription></CardHeader><CardContent className="space-y-3">{group.conditions.length ? group.conditions.map((condition) => <div key={condition.type} className="flex gap-3 border-b pb-3 last:border-0 last:pb-0"><span className={cn("mt-1 size-2 shrink-0 rounded-full", condition.status === "PASS" ? "bg-emerald-500" : condition.status === "UNKNOWN" ? "bg-amber-500" : "bg-destructive")} /><span><strong className="block text-xs">{conditionLabel(condition.type)}</strong><span className="mt-1 block text-xs leading-5 text-muted-foreground">{condition.reason}</span></span></div>) : <p className="text-sm text-muted-foreground">Refresh the profile to populate readiness checks.</p>}</CardContent></Card>
      <Card><CardHeader><CardTitle>Operational status</CardTitle></CardHeader><CardContent className="space-y-3"><FactRow label="Gateway" value={gatewayName ?? "Managed gateway"} /><FactRow label="Consumers" value={String(group.consumers)} /><FactRow label="Control-plane audit" value="Enabled" /><FactRow label="Last synchronized" value={group.lastSynchronizedAt ? new Date(group.lastSynchronizedAt).toLocaleString() : "Never"} /><FactRow label="LiteLLM version" value={group.liteLLMVersion ?? "Not reported"} /></CardContent></Card></div>
  </div>;
}

function RoutingTab({ group, adminUiUrl }: { group: InferenceGroup; adminUiUrl?: string | undefined }) {
  const accounts = useQuery({ queryKey: ["provider-accounts"], queryFn: api.listProviderAccounts });
  const models = useQuery({ queryKey: ["model-deployments"], queryFn: api.listModelDeployments });
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
  return <div className="space-y-4">
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><RouteIcon className="size-5" />Routing contract</CardTitle><CardDescription>The Profile exposes one public identity while LiteLLM owns candidate selection and failover.</CardDescription></CardHeader><CardContent><div className="grid gap-px overflow-hidden border bg-border sm:grid-cols-3"><Fact label="Public model alias" value={group.publicModelAlias} mono /><Fact label="Router type" value={group.capabilities.routerType === "COMPLEXITY_ROUTER" ? "Complexity router" : group.capabilities.routerType === "OTHER" ? "Managed router" : "Not reported"} /><Fact label="Configuration source" value="LiteLLM" /></div>{adminUiUrl ? <Button asChild variant="outline" className="mt-4"><a href={adminUiUrl} target="_blank" rel="noreferrer">Inspect candidates and weights <ExternalLink /></a></Button> : null}</CardContent></Card>
    <Card><CardHeader><CardTitle>Routing capabilities</CardTitle><CardDescription>Read-only behavior detected from the effective LiteLLM configuration.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">{capabilities.map(([label, state]) => <div key={label} className="flex min-h-12 items-center gap-3 border px-3 text-sm"><span className={cn("grid size-6 place-items-center", state === "ENABLED" ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground")}>{state === "ENABLED" ? <Check className="size-4" /> : <Activity className="size-4" />}</span><span><strong className="block text-xs">{label}</strong><span className="text-xs text-muted-foreground">{state === "ENABLED" ? "Enabled in LiteLLM" : state === "DISABLED" ? "Not enabled" : "Not reported"}</span></span></div>)}</CardContent></Card>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Cable className="size-5" />Available upstream pool</CardTitle><CardDescription>Registered connections and deployments that can participate in routing. This inventory does not imply membership in this Profile’s alias.</CardDescription></CardHeader><CardContent>{accounts.isPending || models.isPending ? <p className="text-sm text-muted-foreground">Loading upstream resources…</p> : accounts.error || models.error ? <p role="alert" className="text-sm text-destructive">{accounts.error?.message ?? models.error?.message}</p> : accounts.data?.length ? <div className="divide-y border">{accounts.data.map((account) => { const accountModels = (models.data ?? []).filter((model) => model.providerAccountId === account.id); return <div key={account.id} className="grid gap-3 p-3 text-xs sm:grid-cols-[1fr_1fr_auto] sm:items-center"><div className="flex min-w-0 items-center gap-3"><ProviderIcon presetId={account.presetId} className="size-9 shrink-0 [&_img]:size-5" /><span className="min-w-0"><strong className="block truncate">{account.name}</strong><span className="text-muted-foreground">{providerPresets.find((preset) => preset.id === account.providerKind)?.name ?? account.providerKind}</span></span></div><span><strong className="block font-medium">{accountModels.filter((model) => model.status === "VALIDATED").length} ready models</strong><span className="block truncate text-muted-foreground">{accountModels.map((model) => model.displayName).join(", ") || "No models registered"}</span></span><span className={account.status === "VALIDATED" ? "text-emerald-700" : "text-amber-700"}>{account.status === "VALIDATED" ? "Healthy" : account.status.replaceAll("_", " ")}</span></div>; })}</div> : <div className="border border-dashed p-8 text-center"><Database className="mx-auto size-6 text-muted-foreground" /><p className="mt-3 text-sm">No upstream resources registered.</p><Button asChild variant="outline" className="mt-4"><Link to="/providers/inference-groups">Manage upstream pool <ArrowRight /></Link></Button></div>}</CardContent></Card>
  </div>;
}

function AccessTab({ group, onDelete }: { group: InferenceGroup; onDelete: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description);
  useEffect(() => { setName(group.name); setDescription(group.description); }, [group]);
  const update = useMutation({ mutationFn: (input: Parameters<typeof api.updateInferenceGroup>[1]) => api.updateInferenceGroup(group.id, input), onSuccess: async () => Promise.all([queryClient.invalidateQueries({ queryKey: ["inference-group", group.id] }), queryClient.invalidateQueries({ queryKey: ["inference-groups"] })]) });
  return <div className="space-y-4"><SettingsCard title="Profile identity" description="The human-readable identity shown in every model selection surface."><div className="grid gap-4 sm:grid-cols-2"><Field label="Name"><Input value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label="Description"><Textarea value={description} onChange={(event) => setDescription(event.target.value)} /></Field></div><Button className="mt-4" disabled={update.isPending} onClick={() => update.mutate({ name, description })}>Save profile identity</Button></SettingsCard>
    <SettingsCard title="Access credentials" description="Key material is never displayed or persisted by the TaskLattice API."><div className="flex items-center gap-3 border bg-muted/20 p-3"><KeyRound className="size-5 text-primary" /><span><strong className="block text-sm">Per-Instance Virtual Keys enabled</strong><span className="text-xs text-muted-foreground">Team-scoped · model-restricted · independently revocable</span></span></div></SettingsCard>
    <SettingsCard title="Compliance policy" description="The Model Profile inherits the isolated LiteLLM Gateway domain."><div className="max-w-sm"><ReadOnly label="Compliance domain" value={group.complianceDomain === "CN_MAINLAND" ? "CN Mainland" : "Global"} /></div><p className="mt-3 flex gap-2 text-xs text-muted-foreground"><CircleAlert className="size-4 shrink-0" />Every effective Router candidate must declare this same domain. A mismatch blocks new Instance bindings.</p></SettingsCard>
    <SettingsCard title="Audit policy" description="Control-plane events are always captured; request telemetry depends on LiteLLM callbacks."><div className="grid gap-3 sm:grid-cols-2"><ReadOnly label="Control-plane events" value="Enabled" /><ReadOnly label="Prompt and response capture" value="Disabled" /></div></SettingsCard>
    <SettingsCard title="Lifecycle" description="Suspension removes this Profile from new Instance selection without deleting history."><Button variant="outline" onClick={() => { if (window.confirm(group.status === "SUSPENDED" ? "Resume this Model Profile?" : "Suspend this Model Profile?")) update.mutate({ suspended: group.status !== "SUSPENDED" }); }}>{group.status === "SUSPENDED" ? "Resume Model Profile" : "Suspend Model Profile"}</Button></SettingsCard>
    <Card className="border-destructive/30"><CardHeader><CardTitle className="text-destructive">Danger zone</CardTitle><CardDescription>{group.consumers > 0 ? `${group.consumers} active ${group.consumers === 1 ? "Instance must" : "Instances must"} be reassigned before this Profile can be deleted.` : "Deleting removes this Profile, while keeping Provider connections and upstream model registrations."}</CardDescription></CardHeader><CardContent><Button variant="destructive" onClick={onDelete}><Trash2 />Delete Model Profile</Button></CardContent></Card>
    {update.error ? <p role="alert" className="text-sm text-destructive">{update.error.message}</p> : null}
  </div>;
}

function ConsumersTab({ groupId }: { groupId: string }) {
  const query = useQuery({ queryKey: ["inference-group-consumers", groupId], queryFn: () => api.listInferenceGroupConsumers(groupId) });
  return <Card><CardHeader><CardTitle className="flex items-center gap-2"><Boxes className="size-5" />Profile consumers</CardTitle><CardDescription>Instances using this Model Profile, each with an independently revocable Virtual Key.</CardDescription></CardHeader><CardContent>{query.isPending ? <p className="text-sm text-muted-foreground">Loading consumers…</p> : query.data?.length ? <div className="divide-y border">{query.data.map((binding) => <div key={binding.id} className="grid gap-2 p-3 text-xs sm:grid-cols-3"><span><span className="block text-muted-foreground">Instance</span><strong>{binding.agentId}</strong></span><span><span className="block text-muted-foreground">Key fingerprint</span><strong className="font-mono">{binding.keyFingerprint}</strong></span><span><span className="block text-muted-foreground">Attached</span><strong>{new Date(binding.createdAt).toLocaleString()}</strong></span></div>)}</div> : <p className="py-10 text-center text-sm text-muted-foreground">No Instance currently uses this Model Profile.</p>}</CardContent></Card>;
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
function PathStep({ icon: Icon, label, mono = false, value }: { icon: typeof Database; label: string; mono?: boolean; value: string }) { return <div className="flex min-h-24 items-center gap-3 p-4"><span className="grid size-9 shrink-0 place-items-center bg-muted"><Icon className="size-4 text-primary" /></span><span className="min-w-0"><span className="block text-xs text-muted-foreground">{label}</span><strong className={cn("mt-1 block truncate text-xs font-medium", mono && "font-mono")}>{value}</strong></span></div>; }
function PathArrow() { return <span className="hidden items-center border-x px-2 text-muted-foreground sm:flex"><ArrowRight className="size-4" /></span>; }
function conditionLabel(type: InferenceGroup["conditions"][number]["type"]) { return type === "BINDING" ? "Routing binding" : type === "GATEWAY" ? "Gateway health" : type === "COMPLIANCE" ? "Compliance boundary" : "Capabilities"; }
