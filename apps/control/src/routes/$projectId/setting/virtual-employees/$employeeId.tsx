import { useState } from "react";
import type { AccessScopeBindingInput, IdentityBindingInput, UpdateVirtualEmployeeInput, VirtualEmployeeStatus } from "@tasklattice/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  Edit3,
  KeyRound,
  Link2,
  Plus,
  RefreshCw,
  RotateCw,
  Shield,
  Trash2,
  UserRoundCheck,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useProjectQueryScope } from "@/hooks/use-project-query-scope";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/$projectId/setting/virtual-employees/$employeeId")({
  component: VirtualEmployeeDetailPage,
});

const statusLabels: Record<VirtualEmployeeStatus, string> = {
  active: "Active", draft: "Draft", pending_approval: "Pending approval", provisioning: "Provisioning", suspended: "Suspended", expired: "Expired", error: "Error",
};

function VirtualEmployeeDetailPage() {
  const { employeeId: virtualEmployeeId, projectId } = Route.useParams();
  const scope = useProjectQueryScope();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [modelEditOpen, setModelEditOpen] = useState(false);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const employee = useQuery({ queryKey: scope.key("virtual-employee", virtualEmployeeId), queryFn: () => api.getVirtualEmployee(virtualEmployeeId) });
  const spend = useQuery({ queryKey: scope.key("virtual-employee-spend", virtualEmployeeId), queryFn: () => api.getVirtualEmployeeSpend(virtualEmployeeId), enabled: tab === "spend" });
  const audit = useQuery({ queryKey: scope.key("virtual-employee-audit", virtualEmployeeId), queryFn: () => api.getVirtualEmployeeAudit(virtualEmployeeId), enabled: tab === "audit" });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: scope.key("virtual-employee", virtualEmployeeId) });
    void queryClient.invalidateQueries({ queryKey: scope.key("virtual-employees") });
  };
  const action = useMutation({
    mutationFn: (kind: "activate" | "provision" | "rotate" | "suspend" | "sync" | "apply") => {
      if (kind === "suspend") return api.suspendVirtualEmployee(virtualEmployeeId);
      if (kind === "activate") return api.activateVirtualEmployee(virtualEmployeeId);
      if (kind === "provision") return api.provisionVirtualEmployee(virtualEmployeeId);
      if (kind === "rotate") return api.rotateVirtualEmployeeCredential(virtualEmployeeId);
      return api.syncVirtualEmployee(virtualEmployeeId, kind === "apply");
    },
    onSuccess: refresh,
  });
  const detachIdentity = useMutation({
    mutationFn: (bindingId: string) => api.detachVirtualEmployeeIdentity(virtualEmployeeId, bindingId),
    onSuccess: refresh,
  });
  const detachScope = useMutation({
    mutationFn: (scopeId: string) => api.detachVirtualEmployeeScope(virtualEmployeeId, scopeId),
    onSuccess: refresh,
  });

  if (employee.isPending) return <div className="h-[32rem] animate-pulse rounded-md bg-muted/50" />;
  if (employee.error) return <div role="alert" className="border-l-2 border-destructive bg-destructive/5 p-4 text-sm text-destructive">{employee.error.message}</div>;
  const value = employee.data;
  const access = value.modelAccess;

  return (
    <div className="space-y-6">
      <Link
        to="/$projectId/setting"
        params={{ projectId }}
        search={{ section: "members" }}
        className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2"
      >
        <ArrowLeft className="size-4" /> Project team
      </Link>
      <PageHeader
        title={value.displayName}
        badge={<Badge variant="outline" className={cn("gap-1.5", value.status === "active" ? "border-emerald-500/25 bg-emerald-500/8 text-emerald-700" : value.status === "error" ? "border-destructive/25 bg-destructive/5 text-destructive" : "bg-muted/40")}><span className="size-1.5 rounded-full bg-current" />{statusLabels[value.status]}</Badge>}
        description={value.description || `${value.businessRole || "Virtual Employee"} · ${value.environment}`}
        actions={<div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setEditOpen(true)}><Edit3 /> Edit</Button>
          {value.status === "active" ? <Button variant="outline" disabled={action.isPending} onClick={() => action.mutate("suspend")}><Shield /> Suspend</Button> : <Button variant="outline" disabled={action.isPending || !access} onClick={() => action.mutate(value.status === "error" ? "provision" : "activate")}><CheckCircle2 /> {value.status === "error" ? "Retry provisioning" : "Activate"}</Button>}
          <Button variant="outline" disabled={action.isPending || !access?.litellmKeyId} onClick={() => action.mutate("rotate")}><RotateCw /> Rotate credential</Button>
        </div>}
      />

      {access?.syncStatus === "drifted" ? <div role="status" className="flex flex-col gap-3 border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm sm:flex-row sm:items-center"><AlertTriangle className="size-5 shrink-0 text-amber-700" /><div className="flex-1"><strong>Configuration drift detected</strong><p className="mt-0.5 text-xs text-muted-foreground">LiteLLM differs from the TALI desired configuration. Review before applying.</p></div><Button size="sm" variant="outline" onClick={() => action.mutate("apply")}>Sync to LiteLLM</Button></div> : null}
      {value.status === "error" && access?.lastSyncError ? <div role="alert" className="border-l-2 border-destructive bg-destructive/5 p-4 text-sm"><strong>Model access provisioning failed.</strong><p className="mt-1 text-muted-foreground">{access.lastSyncError}</p></div> : null}
      {action.error ? <div role="alert" className="border-l-2 border-destructive bg-destructive/5 p-3 text-sm text-destructive">{action.error.message}</div> : null}

      <Tabs value={tab} onValueChange={setTab}>
        <div className="overflow-x-auto"><TabsList variant="line">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="model">Model Access</TabsTrigger>
          <TabsTrigger value="identities">System Identities</TabsTrigger>
          <TabsTrigger value="scope">Access Scope</TabsTrigger>
          <TabsTrigger value="instances">Instances</TabsTrigger>
          <TabsTrigger value="spend">Spend</TabsTrigger>
          <TabsTrigger value="audit">Audit Activity</TabsTrigger>
        </TabsList></div>

        <TabsContent value="overview" className="mt-5 space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <Metric icon={<KeyRound />} label="Model access" value={`${access?.allowedModels.length ?? 0} models`} detail={access?.syncStatus ?? "Not configured"} />
            <Metric icon={<UserRoundCheck />} label="Backing identities" value={String(value.identities.length)} detail={value.identities.length ? "Attached references" : "None attached"} />
            <Metric icon={<Link2 />} label="Bound instances" value={String(value.boundInstanceIds.length)} detail="Live references" />
          </div>
          <Card><CardHeader><CardTitle>Business identity</CardTitle></CardHeader><CardContent><dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3"><Definition label="Identifier" value={value.name} mono /><Definition label="Business role" value={value.businessRole || "Not set"} /><Definition label="Owner team" value={value.ownerTeamId || "Unassigned"} /><Definition label="Environment" value={value.environment} /><Definition label="Created by" value={value.createdBy} /><Definition label="Updated" value={new Date(value.updatedAt).toLocaleString()} /></dl></CardContent></Card>
          <Card><CardHeader><CardTitle>Control boundary</CardTitle><CardDescription>Virtual Employee defines identity and access. Runtime Policy remains an independent OpenShell control.</CardDescription></CardHeader><CardContent className="grid gap-3 md:grid-cols-2"><Boundary title="Model scope" body="LiteLLM enforced" detail={`${access?.allowedModels.join(", ") || "No models"} · ${access?.rpmLimit ?? "—"} RPM / ${access?.tpmLimit ?? "—"} TPM`} tone="good" /><Boundary title="System scope" body={value.accessScopes.some((item) => item.enforcementProvider !== "metadata_only") ? "Mixed enforcement" : "Metadata only"} detail={`${value.accessScopes.length} approved resource scopes`} tone="warn" /></CardContent></Card>
        </TabsContent>

        <TabsContent value="model" className="mt-5">
          {access ? <Card><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>LiteLLM model access</CardTitle><CardDescription>Service Account Key details and synchronization state. Full credentials are never displayed.</CardDescription></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setModelEditOpen(true)}><Edit3 /> Edit limits</Button><Button variant="outline" size="sm" disabled={action.isPending || !access.litellmKeyId} onClick={() => action.mutate("sync")}><RefreshCw /> Sync now</Button></div></div></CardHeader><CardContent className="space-y-6">
            <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3"><Definition label="LiteLLM team" value={access.litellmTeamId || "Pending"} mono /><Definition label="Key alias" value={access.keyAlias} mono /><Definition label="Key ID" value={access.litellmKeyId || "Pending"} mono /><Definition label="Credential" value={access.keyLastFour ? `•••• ${access.keyLastFour}` : "Not issued"} mono /><Definition label="Monthly budget" value={access.maxBudget !== undefined ? `$${access.maxBudget.toFixed(2)}` : "No limit"} /><Definition label="Rate limits" value={`${access.rpmLimit ?? "—"} RPM · ${access.tpmLimit ?? "—"} TPM`} /><Definition label="Expires" value={access.expiresAt ? new Date(access.expiresAt).toLocaleDateString() : "Not set"} /><Definition label="Last synchronized" value={access.lastSyncedAt ? new Date(access.lastSyncedAt).toLocaleString() : "Never"} /><Definition label="Sync status" value={access.syncStatus} /></dl>
            <div><h3 className="text-xs font-medium text-muted-foreground">Allowed models and access groups</h3><div className="mt-2 flex flex-wrap gap-2">{[...access.allowedModels, ...access.accessGroups].map((model) => <Badge key={model} variant="outline">{model}</Badge>)}</div></div>
          </CardContent></Card> : <div className="space-y-4"><Empty title="No model access" body="Configure Model Access before this Virtual Employee can be activated." /><Button onClick={() => setModelEditOpen(true)}><Plus /> Configure Model Access</Button></div>}
        </TabsContent>

        <TabsContent value="identities" className="mt-5 space-y-4">
          <div className="flex justify-end"><Button onClick={() => setIdentityOpen(true)}><Plus /> Attach identity</Button></div>
          {value.identities.length ? <div className="overflow-x-auto border"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b bg-muted/35 text-xs text-muted-foreground"><tr>{["Identity name", "Type", "Provider / system", "Credential source", "Status", "Updated", ""].map((item, index) => <th key={`${item}-${index}`} className="px-4 py-3 font-medium">{item}</th>)}</tr></thead><tbody className="divide-y">{value.identities.map((item) => <tr key={item.id}><td className="px-4 py-4 font-medium">{item.displayName}</td><td className="px-4 py-4">{item.identityType.replaceAll("_", " ")}</td><td className="px-4 py-4 text-muted-foreground">{item.system || item.provider}</td><td className="max-w-xs truncate px-4 py-4 font-mono text-xs">{item.externalReference}</td><td className="px-4 py-4"><Badge variant="outline">{item.status}</Badge></td><td className="px-4 py-4 text-muted-foreground">{new Date(item.updatedAt).toLocaleDateString()}</td><td className="px-4 py-4 text-right"><Button variant="ghost" size="icon" aria-label={`Detach ${item.displayName}`} disabled={detachIdentity.isPending} onClick={() => { if (window.confirm(`Detach ${item.displayName}?`)) detachIdentity.mutate(item.id); }}><Trash2 /></Button></td></tr>)}</tbody></table></div> : <Empty title="No system identities" body="Attach references to Kubernetes ServiceAccounts, Functional IDs, OAuth clients, or external credential providers." />}
        </TabsContent>

        <TabsContent value="scope" className="mt-5 space-y-4">
          <div className="flex justify-end"><Button onClick={() => setScopeOpen(true)}><Plus /> Add access scope</Button></div>
          {value.accessScopes.length ? <div className="overflow-x-auto border"><table className="w-full min-w-[800px] text-left text-sm"><thead className="border-b bg-muted/35 text-xs text-muted-foreground"><tr>{["Resource", "Actions", "Conditions", "Enforcement provider", "Approval", ""].map((item, index) => <th key={`${item}-${index}`} className="px-4 py-3 font-medium">{item}</th>)}</tr></thead><tbody className="divide-y">{value.accessScopes.map((item) => <tr key={item.id}><td className="px-4 py-4"><strong className="block">{item.resourceType}</strong><span className="text-xs text-muted-foreground">{item.resourceId}</span></td><td className="px-4 py-4">{item.actions.join(", ")}</td><td className="px-4 py-4 text-muted-foreground">{Object.keys(item.conditions).length ? JSON.stringify(item.conditions) : "None"}</td><td className="px-4 py-4"><Enforcement value={item.enforcementProvider} /></td><td className="px-4 py-4"><Badge variant="outline">{item.approvalStatus.replaceAll("_", " ")}</Badge></td><td className="px-4 py-4 text-right"><Button variant="ghost" size="icon" aria-label={`Remove ${item.resourceId}`} disabled={detachScope.isPending} onClick={() => { if (window.confirm(`Remove access scope ${item.resourceId}?`)) detachScope.mutate(item.id); }}><Trash2 /></Button></td></tr>)}</tbody></table></div> : <Empty title="No system access scopes" body="Model access is enforced by LiteLLM. Add separately enforced or metadata-only system scopes here." />}
        </TabsContent>

        <TabsContent value="instances" className="mt-5">{value.boundInstanceIds.length ? <Card><CardHeader><CardTitle>Bound Agent Instances</CardTitle><CardDescription>Each Instance resolves this Virtual Employee at runtime; access data is not copied.</CardDescription></CardHeader><CardContent className="divide-y">{value.boundInstanceIds.map((id) => <Link key={id} to="/$projectId/instances/$instanceId" params={{ projectId, instanceId: id }} className="flex min-h-14 items-center justify-between py-3 font-mono text-xs hover:text-primary">{id}<ArrowLeft className="size-4 rotate-180" /></Link>)}</CardContent></Card> : <Empty title="Not assigned" body="This Virtual Employee is ready to be selected when an Agent Instance is created." />}</TabsContent>

        <TabsContent value="spend" className="mt-5">{spend.isPending ? <div className="h-64 animate-pulse bg-muted/50" /> : spend.error ? <p role="alert" className="text-destructive">{spend.error.message}</p> : <div className="space-y-4"><div className="grid gap-4 sm:grid-cols-3"><Metric icon={<CircleDollarSign />} label="Total spend · 30d" value={`$${spend.data.totalSpend.toFixed(2)}`} detail={spend.data.budgetUtilization !== undefined ? `${spend.data.budgetUtilization.toFixed(1)}% of budget` : "No budget"} /><Metric icon={<Activity />} label="Requests" value={spend.data.requests.toLocaleString()} detail="LiteLLM attributed" /><Metric icon={<Bot />} label="Tokens" value={spend.data.tokens.toLocaleString()} detail="Prompt + completion" /></div><Card><CardHeader><CardTitle>Spend by model</CardTitle></CardHeader><CardContent>{spend.data.byModel.length ? <div className="divide-y">{spend.data.byModel.map((item) => <div key={item.model} className="grid grid-cols-[1fr_auto_auto] gap-4 py-3 text-sm"><strong>{item.model}</strong><span className="text-muted-foreground">{item.requests} requests</span><span className="tabular-nums">${item.spend.toFixed(4)}</span></div>)}</div> : <p className="text-sm text-muted-foreground">No attributed spend in the last 30 days.</p>}</CardContent></Card></div>}</TabsContent>

        <TabsContent value="audit" className="mt-5">{audit.isPending ? <div className="h-64 animate-pulse bg-muted/50" /> : audit.error ? <p role="alert" className="text-destructive">{audit.error.message}</p> : <Card><CardHeader><CardTitle>Audit activity</CardTitle><CardDescription>Provisioning, access, credential, synchronization, and binding events.</CardDescription></CardHeader><CardContent className="divide-y">{audit.data.length ? audit.data.map((event) => <div key={event.id} className="grid gap-1 py-4 sm:grid-cols-[1fr_auto]"><div><strong className="text-sm">{event.type.replaceAll(".", " ")}</strong><p className="mt-1 text-xs text-muted-foreground">{event.message}</p></div><div className="text-xs text-muted-foreground sm:text-right"><span className="block">{event.actor}</span><time>{new Date(event.createdAt).toLocaleString()}</time></div></div>) : <p className="py-5 text-sm text-muted-foreground">No audit activity recorded.</p>}</CardContent></Card>}</TabsContent>
      </Tabs>

      <EditEmployeeDialog open={editOpen} onOpenChange={setEditOpen} employee={value} onSaved={refresh} />
      <EditModelAccessDialog open={modelEditOpen} onOpenChange={setModelEditOpen} employee={value} onSaved={refresh} />
      <AttachIdentityDialog open={identityOpen} onOpenChange={setIdentityOpen} id={value.id} onSaved={refresh} />
      <AttachScopeDialog open={scopeOpen} onOpenChange={setScopeOpen} id={value.id} onSaved={refresh} />
    </div>
  );
}

function Metric({ detail, icon, label, value }: { detail: string; icon: React.ReactNode; label: string; value: string }) {
  return <Card><CardContent className="flex items-start gap-4 p-5"><span className="grid size-10 shrink-0 place-items-center bg-primary/8 text-primary [&_svg]:size-5">{icon}</span><div><p className="text-xs text-muted-foreground">{label}</p><strong className="mt-1 block text-xl font-semibold">{value}</strong><span className="mt-1 block text-xs text-muted-foreground">{detail}</span></div></CardContent></Card>;
}

function Definition({ label, mono = false, value }: { label: string; mono?: boolean; value: string }) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className={cn("mt-1 break-words text-sm font-medium capitalize", mono && "font-mono text-xs normal-case")}>{value}</dd></div>;
}

function Boundary({ body, detail, title, tone }: { body: string; detail: string; title: string; tone: "good" | "warn" }) {
  return <div className="border p-4"><div className="flex items-center justify-between gap-3"><strong className="text-sm">{title}</strong><Badge variant="outline" className={tone === "good" ? "border-emerald-500/25 text-emerald-700" : "border-amber-500/25 text-amber-800"}>{body}</Badge></div><p className="mt-3 text-xs text-muted-foreground">{detail}</p></div>;
}

function Enforcement({ value }: { value: string }) {
  const label = value === "metadata_only" ? "Metadata only" : value === "adapter" ? "Partially enforced" : "Enforced";
  return <span><Badge variant="outline" className={value === "metadata_only" ? "border-amber-500/25 text-amber-800" : "border-emerald-500/25 text-emerald-700"}>{label}</Badge><span className="mt-1 block text-[11px] text-muted-foreground">{value.replaceAll("_", " ")}</span></span>;
}

function Empty({ body, title }: { body: string; title: string }) {
  return <div className="flex min-h-60 flex-col items-center justify-center border border-dashed px-6 text-center"><UserRoundCheck className="size-8 text-muted-foreground" /><h2 className="mt-4 font-semibold">{title}</h2><p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{body}</p></div>;
}

function EditEmployeeDialog({ employee, onSaved, onOpenChange, open }: { employee: Awaited<ReturnType<typeof api.getVirtualEmployee>>; onSaved: () => void; onOpenChange: (open: boolean) => void; open: boolean }) {
  const [displayName, setDisplayName] = useState(employee.displayName);
  const [description, setDescription] = useState(employee.description ?? "");
  const [businessRole, setBusinessRole] = useState(employee.businessRole ?? "");
  const [ownerTeamId, setOwnerTeamId] = useState(employee.ownerTeamId ?? "");
  const mutation = useMutation({
    mutationFn: (input: UpdateVirtualEmployeeInput) => api.updateVirtualEmployee(employee.id, input),
    onSuccess: () => { onSaved(); onOpenChange(false); },
  });
  return <Dialog open={open} onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}><DialogContent><DialogHeader><DialogTitle>Edit Virtual Employee</DialogTitle><DialogDescription>Update business-facing identity details. Model access changes synchronize through the dedicated workflow.</DialogDescription></DialogHeader><div className="space-y-4 overflow-y-auto px-6 py-5"><Field label="Display name"><Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></Field><Field label="Business role"><Input value={businessRole} onChange={(event) => setBusinessRole(event.target.value)} /></Field><Field label="Owner team"><Input value={ownerTeamId} onChange={(event) => setOwnerTeamId(event.target.value)} /></Field><Field label="Description"><Textarea value={description} onChange={(event) => setDescription(event.target.value)} /></Field>{mutation.error ? <p role="alert" className="text-sm text-destructive">{mutation.error.message}</p> : null}</div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={mutation.isPending || displayName.trim().length < 2} onClick={() => mutation.mutate({ displayName, description, businessRole: businessRole || undefined, ownerTeamId: ownerTeamId || undefined })}>{mutation.isPending ? "Saving…" : "Save changes"}</Button></DialogFooter></DialogContent></Dialog>;
}

function EditModelAccessDialog({ employee, onSaved, onOpenChange, open }: { employee: Awaited<ReturnType<typeof api.getVirtualEmployee>>; onSaved: () => void; onOpenChange: (open: boolean) => void; open: boolean }) {
  const current = employee.modelAccess;
  const [models, setModels] = useState(current?.allowedModels.join(", ") ?? "");
  const [groups, setGroups] = useState(current?.accessGroups.join(", ") ?? "");
  const [fallbacks, setFallbacks] = useState(current?.fallbackModels.join(", ") ?? "");
  const [maxBudget, setMaxBudget] = useState(current?.maxBudget?.toString() ?? "");
  const [rpmLimit, setRpmLimit] = useState(current?.rpmLimit?.toString() ?? "");
  const [tpmLimit, setTpmLimit] = useState(current?.tpmLimit?.toString() ?? "");
  const [parallel, setParallel] = useState(current?.maxParallelRequests?.toString() ?? "");
  const [budgetDuration, setBudgetDuration] = useState(current?.budgetDuration ?? "30d");
  const [keyDuration, setKeyDuration] = useState(current?.keyDuration ?? "90d");
  const list = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);
  const mutation = useMutation({
    mutationFn: () => api.updateVirtualEmployee(employee.id, {
      modelAccess: {
        ...(current?.litellmTeamId ? { litellmTeamId: current.litellmTeamId } : {}),
        allowedModels: list(models),
        accessGroups: list(groups),
        fallbackModels: list(fallbacks),
        ...(optionalNumber(maxBudget) !== undefined ? { maxBudget: optionalNumber(maxBudget) } : {}),
        ...(optionalNumber(rpmLimit) !== undefined ? { rpmLimit: optionalNumber(rpmLimit) } : {}),
        ...(optionalNumber(tpmLimit) !== undefined ? { tpmLimit: optionalNumber(tpmLimit) } : {}),
        ...(optionalNumber(parallel) !== undefined ? { maxParallelRequests: optionalNumber(parallel) } : {}),
        budgetDuration,
        keyDuration,
      },
    }),
    onSuccess: () => { onSaved(); onOpenChange(false); },
  });
  return <Dialog open={open} onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}><DialogContent><DialogHeader><DialogTitle>Configure Model Access</DialogTitle><DialogDescription>These limits are owned by TALI and synchronized to the LiteLLM Service Account Key. Existing credentials remain hidden.</DialogDescription></DialogHeader><div className="grid max-h-[65vh] gap-4 overflow-y-auto px-6 py-5 sm:grid-cols-2"><div className="sm:col-span-2"><Field label="Allowed models"><Input value={models} onChange={(event) => setModels(event.target.value)} placeholder="production-chat, coding-model" /></Field></div><Field label="Access groups"><Input value={groups} onChange={(event) => setGroups(event.target.value)} placeholder="engineering" /></Field><Field label="Fallback models"><Input value={fallbacks} onChange={(event) => setFallbacks(event.target.value)} /></Field><Field label="Maximum budget"><Input inputMode="decimal" value={maxBudget} onChange={(event) => setMaxBudget(event.target.value)} placeholder="No limit" /></Field><Field label="Budget duration"><Input value={budgetDuration} onChange={(event) => setBudgetDuration(event.target.value)} placeholder="30d" /></Field><Field label="RPM limit"><Input inputMode="numeric" value={rpmLimit} onChange={(event) => setRpmLimit(event.target.value)} /></Field><Field label="TPM limit"><Input inputMode="numeric" value={tpmLimit} onChange={(event) => setTpmLimit(event.target.value)} /></Field><Field label="Parallel requests"><Input inputMode="numeric" value={parallel} onChange={(event) => setParallel(event.target.value)} /></Field><Field label="Credential duration"><Input value={keyDuration} onChange={(event) => setKeyDuration(event.target.value)} placeholder="90d" /></Field>{mutation.error ? <p role="alert" className="sm:col-span-2 text-sm text-destructive">{mutation.error.message}</p> : null}</div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={mutation.isPending || list(models).length === 0 || !/^\d+(s|m|h|d|w)$/.test(keyDuration)} onClick={() => mutation.mutate()}>{mutation.isPending ? "Saving…" : "Save and synchronize"}</Button></DialogFooter></DialogContent></Dialog>;
}

function AttachIdentityDialog({ id, onSaved, onOpenChange, open }: { id: string; onSaved: () => void; onOpenChange: (open: boolean) => void; open: boolean }) {
  const [type, setType] = useState<IdentityBindingInput["identityType"]>("kubernetes_service_account");
  const [displayName, setDisplayName] = useState("");
  const [provider, setProvider] = useState("");
  const [reference, setReference] = useState("");
  const mutation = useMutation({ mutationFn: () => api.attachVirtualEmployeeIdentity(id, { identityType: type, displayName, provider, externalReference: reference, metadata: {} }), onSuccess: () => { onSaved(); onOpenChange(false); } });
  return <Dialog open={open} onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}><DialogContent><DialogHeader><DialogTitle>Attach identity</DialogTitle><DialogDescription>Store a public reference to an external identity. Do not enter a password, token, or client secret.</DialogDescription></DialogHeader><div className="space-y-4 px-6 py-5"><Field label="Type"><Select value={type} onValueChange={(value) => setType(value as typeof type)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="kubernetes_service_account">Kubernetes ServiceAccount</SelectItem><SelectItem value="functional_id">Functional ID</SelectItem><SelectItem value="oauth_client">OAuth Client</SelectItem><SelectItem value="api_credential">API Credential Reference</SelectItem><SelectItem value="cloud_role">Cloud Role</SelectItem><SelectItem value="custom">Custom</SelectItem></SelectContent></Select></Field><Field label="Display name"><Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></Field><Field label="Provider / system"><Input value={provider} onChange={(event) => setProvider(event.target.value)} /></Field><Field label="Credential reference"><Input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="safe://system/prod/identity" /></Field>{mutation.error ? <p role="alert" className="text-sm text-destructive">{mutation.error.message}</p> : null}</div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={mutation.isPending || !displayName || !provider || !reference} onClick={() => mutation.mutate()}>{mutation.isPending ? "Attaching…" : "Attach identity"}</Button></DialogFooter></DialogContent></Dialog>;
}

function AttachScopeDialog({ id, onSaved, onOpenChange, open }: { id: string; onSaved: () => void; onOpenChange: (open: boolean) => void; open: boolean }) {
  const [resourceType, setResourceType] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [actions, setActions] = useState("");
  const [provider, setProvider] = useState<AccessScopeBindingInput["enforcementProvider"]>("metadata_only");
  const mutation = useMutation({ mutationFn: () => api.attachVirtualEmployeeScope(id, { resourceType, resourceId, actions: actions.split(",").map((item) => item.trim()).filter(Boolean), conditions: {}, enforcementProvider: provider, approvalStatus: provider === "metadata_only" ? "pending" : "approved" }), onSuccess: () => { onSaved(); onOpenChange(false); } });
  return <Dialog open={open} onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}><DialogContent><DialogHeader><DialogTitle>Add access scope</DialogTitle><DialogDescription>Document approved actions and name the system that actually enforces them.</DialogDescription></DialogHeader><div className="space-y-4 px-6 py-5"><Field label="Resource type"><Input value={resourceType} onChange={(event) => setResourceType(event.target.value)} placeholder="Kubernetes" /></Field><Field label="Resource"><Input value={resourceId} onChange={(event) => setResourceId(event.target.value)} placeholder="namespace/data-analysis" /></Field><Field label="Actions"><Input value={actions} onChange={(event) => setActions(event.target.value)} placeholder="get, list" /></Field><Field label="Enforcement provider"><Select value={provider} onValueChange={(value) => setProvider(value as typeof provider)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="kubernetes_rbac">Kubernetes RBAC · Enforced</SelectItem><SelectItem value="target_system">Target system · Enforced</SelectItem><SelectItem value="adapter">Adapter · Partially enforced</SelectItem><SelectItem value="metadata_only">Metadata only · Not enforced</SelectItem></SelectContent></Select></Field>{mutation.error ? <p role="alert" className="text-sm text-destructive">{mutation.error.message}</p> : null}</div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={mutation.isPending || !resourceType || !resourceId || !actions.trim()} onClick={() => mutation.mutate()}>{mutation.isPending ? "Adding…" : "Add access scope"}</Button></DialogFooter></DialogContent></Dialog>;
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return <label className="block space-y-2"><Label>{label}</Label>{children}</label>;
}

function optionalNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
