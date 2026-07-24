import { useMemo, useState } from "react";
import type { CreateVirtualEmployeeInput, VirtualEmployee, VirtualEmployeeStatus } from "@tasklattice/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  Filter,
  KeyRound,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import { EntityFormSheet } from "@/components/shared/entity-form-sheet";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useProjectQueryScope } from "@/hooks/use-project-query-scope";
import { useCurrentProjectId } from "@/hooks/use-project";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/$projectId/virtual-employees/")({
  component: VirtualEmployeesPage,
});

const statuses: Array<VirtualEmployeeStatus | "all"> = [
  "all", "active", "draft", "pending_approval", "suspended", "expired", "error",
];

const statusLabels: Record<VirtualEmployeeStatus, string> = {
  active: "Active",
  draft: "Draft",
  pending_approval: "Pending approval",
  provisioning: "Provisioning",
  suspended: "Suspended",
  expired: "Expired",
  error: "Error",
};

function StatusBadge({ status }: { status: VirtualEmployeeStatus }) {
  const tone = status === "active"
    ? "border-emerald-500/25 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300"
    : status === "error" || status === "expired"
      ? "border-destructive/25 bg-destructive/5 text-destructive"
      : status === "suspended"
        ? "border-amber-500/25 bg-amber-500/8 text-amber-800 dark:text-amber-200"
        : "border-border bg-muted/40 text-muted-foreground";
  return <Badge variant="outline" className={cn("gap-1.5 font-medium", tone)}><span className="size-1.5 rounded-full bg-current" />{statusLabels[status]}</Badge>;
}

function relativeTime(value: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return new Date(value).toLocaleDateString();
}

function VirtualEmployeesPage() {
  const projectId = useCurrentProjectId();
  const scope = useProjectQueryScope();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof statuses)[number]>("all");
  const [environment, setEnvironment] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const employees = useQuery({ queryKey: scope.key("virtual-employees"), queryFn: api.listVirtualEmployees });
  const filtered = useMemo(() => (employees.data ?? []).filter((employee) => {
    const matchesQuery = `${employee.displayName} ${employee.name} ${employee.businessRole ?? ""} ${employee.ownerTeamId ?? ""}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (status === "all" || employee.status === status) && (environment === "all" || employee.environment === environment);
  }), [employees.data, environment, query, status]);
  const action = useMutation({
    mutationFn: ({ id, kind }: { id: string; kind: "activate" | "provision" | "suspend" }) =>
      kind === "suspend" ? api.suspendVirtualEmployee(id) : kind === "activate" ? api.activateVirtualEmployee(id) : api.provisionVirtualEmployee(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: scope.key("virtual-employees") }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Virtual Employees"
        description="Manage the business identities, model access, and approved system access used by agent instances."
        actions={<Button onClick={() => setCreateOpen(true)}><Plus /> Create virtual employee</Button>}
      />

      <section aria-label="Virtual Employee filters" className="flex flex-col gap-3 border-b pb-5 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1 lg:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search virtual employees" aria-label="Search virtual employees" className="pl-9" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
            <SelectTrigger className="w-44"><Filter className="size-4" /><SelectValue /></SelectTrigger>
            <SelectContent>{statuses.map((value) => <SelectItem key={value} value={value}>{value === "all" ? "All statuses" : statusLabels[value]}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={environment} onValueChange={setEnvironment}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All environments</SelectItem><SelectItem value="development">Development</SelectItem><SelectItem value="uat">UAT</SelectItem><SelectItem value="production">Production</SelectItem></SelectContent>
          </Select>
        </div>
      </section>

      {employees.isPending ? <div className="h-72 animate-pulse rounded-md bg-muted/50" /> : employees.error ? (
        <div role="alert" className="border-l-2 border-destructive bg-destructive/5 p-4 text-sm text-destructive">{employees.error.message}</div>
      ) : filtered.length ? (
        <div className="overflow-x-auto border">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="border-b bg-muted/35 text-xs text-muted-foreground">
              <tr>{["Name", "Status", "Role / Purpose", "Model Access", "Backing Identities", "Bound Instances", "Monthly Spend", "Updated", ""].map((label) => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}</tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((employee) => (
                <tr key={employee.id} className="group hover:bg-muted/20">
                  <td className="px-4 py-4"><Link to="/$projectId/virtual-employees/$employeeId" params={{ projectId, employeeId: employee.id }} className="block min-w-48 rounded-sm focus-visible:outline-2"><strong className="block font-medium group-hover:text-primary">{employee.displayName}</strong><span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">{employee.name}</span></Link></td>
                  <td className="px-4 py-4"><StatusBadge status={employee.status} /></td>
                  <td className="px-4 py-4 text-muted-foreground">{employee.businessRole || "—"}</td>
                  <td className="px-4 py-4"><strong>{employee.modelAccess?.allowedModels.length ?? 0}</strong> <span className="text-muted-foreground">models</span></td>
                  <td className="px-4 py-4"><strong>{employee.identities.length}</strong> <span className="text-muted-foreground">identities</span></td>
                  <td className="px-4 py-4"><strong>{employee.boundInstanceIds.length}</strong> <span className="text-muted-foreground">instances</span></td>
                  <td className="px-4 py-4 tabular-nums">${(employee.modelAccess?.currentSpend ?? 0).toFixed(2)}</td>
                  <td className="px-4 py-4 text-muted-foreground">{relativeTime(employee.updatedAt)}</td>
                  <td className="px-3 py-3">
                    <DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label={`Actions for ${employee.displayName}`}><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
                      <DropdownMenuItem asChild><Link to="/$projectId/virtual-employees/$employeeId" params={{ projectId, employeeId: employee.id }}>View details</Link></DropdownMenuItem>
                      {employee.status === "active" ? <DropdownMenuItem onSelect={() => action.mutate({ id: employee.id, kind: "suspend" })}>Suspend</DropdownMenuItem> : employee.status === "error" ? <DropdownMenuItem onSelect={() => action.mutate({ id: employee.id, kind: "provision" })}><RefreshCw /> Retry provisioning</DropdownMenuItem> : <DropdownMenuItem onSelect={() => action.mutate({ id: employee.id, kind: "activate" })}>Activate</DropdownMenuItem>}
                    </DropdownMenuContent></DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex min-h-72 flex-col items-center justify-center border border-dashed px-6 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-primary/8 text-primary"><UserRoundCheck className="size-6" /></span>
          <h2 className="mt-4 text-lg font-semibold">{employees.data?.length ? "No matching virtual employees" : "Create your first Virtual Employee"}</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{employees.data?.length ? "Adjust the search or filters to see more results." : "Bundle model access, backing identities, and approved system scope into one assignable business identity."}</p>
          {!employees.data?.length ? <Button className="mt-5" onClick={() => setCreateOpen(true)}><Plus /> Create virtual employee</Button> : null}
        </div>
      )}
      {action.error ? <p role="alert" className="border-l-2 border-destructive bg-destructive/5 p-3 text-sm text-destructive">{action.error.message}</p> : null}
      <CreateVirtualEmployeeSheet open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

type Draft = {
  name: string;
  displayName: string;
  description: string;
  businessRole: string;
  ownerTeamId: string;
  environment: "development" | "uat" | "production";
  tags: string;
  litellmTeamId: string;
  allowedModels: string;
  accessGroups: string;
  maxBudget: string;
  rpmLimit: string;
  tpmLimit: string;
  maxParallelRequests: string;
  keyDuration: string;
  fallbackModels: string;
  identityType: "none" | "kubernetes_service_account" | "functional_id" | "oauth_client" | "api_credential" | "cloud_role" | "custom";
  identityDisplayName: string;
  identityProvider: string;
  identityReference: string;
  resourceType: string;
  resourceId: string;
  actions: string;
  enforcementProvider: "metadata_only" | "kubernetes_rbac" | "target_system" | "adapter";
};

const initialDraft: Draft = {
  name: "", displayName: "", description: "", businessRole: "", ownerTeamId: "", environment: "production", tags: "",
  litellmTeamId: "", allowedModels: "", accessGroups: "", maxBudget: "100", rpmLimit: "60", tpmLimit: "500000", maxParallelRequests: "10", keyDuration: "90d", fallbackModels: "",
  identityType: "none", identityDisplayName: "", identityProvider: "", identityReference: "",
  resourceType: "", resourceId: "", actions: "", enforcementProvider: "metadata_only",
};

function list(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function numeric(value: string): number | undefined {
  const parsed = Number(value);
  return value.trim() && Number.isFinite(parsed) ? parsed : undefined;
}

function CreateVirtualEmployeeSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const scope = useProjectQueryScope();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const steps = ["Basic information", "Model access", "System identities", "Access scope", "Review"];
  const mutation = useMutation({
    mutationFn: (input: CreateVirtualEmployeeInput) => api.createVirtualEmployee(input),
    onSuccess: (employee) => {
      void queryClient.invalidateQueries({ queryKey: scope.key("virtual-employees") });
      setDraft(initialDraft);
      setStep(0);
      onOpenChange(false);
      window.location.assign(`/security/virtual-employees/${employee.id}`);
    },
  });
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const canContinue = step === 0
    ? /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.name) && draft.displayName.trim().length >= 2
    : step === 1
      ? list(draft.allowedModels).length > 0 && /^\d+(?:s|m|h|d|w)$/.test(draft.keyDuration)
      : true;
  const create = () => mutation.mutate({
    name: draft.name,
    displayName: draft.displayName,
    description: draft.description,
    businessRole: draft.businessRole || undefined,
    ownerTeamId: draft.ownerTeamId || undefined,
    environment: draft.environment,
    tags: list(draft.tags),
    modelAccess: {
      litellmTeamId: draft.litellmTeamId || undefined,
      allowedModels: list(draft.allowedModels),
      accessGroups: list(draft.accessGroups),
      maxBudget: numeric(draft.maxBudget),
      budgetDuration: "30d",
      rpmLimit: numeric(draft.rpmLimit),
      tpmLimit: numeric(draft.tpmLimit),
      maxParallelRequests: numeric(draft.maxParallelRequests),
      keyDuration: draft.keyDuration,
      fallbackModels: list(draft.fallbackModels),
    },
    identities: draft.identityType === "none" ? [] : [{
      identityType: draft.identityType,
      provider: draft.identityProvider || "external",
      externalReference: draft.identityReference,
      displayName: draft.identityDisplayName,
      metadata: {},
    }],
    accessScopes: draft.resourceType && draft.resourceId && list(draft.actions).length ? [{
      resourceType: draft.resourceType,
      resourceId: draft.resourceId,
      actions: list(draft.actions),
      conditions: {},
      enforcementProvider: draft.enforcementProvider,
      approvalStatus: draft.enforcementProvider === "metadata_only" ? "pending" : "approved",
    }] : [],
    activate: true,
  });

  return (
    <EntityFormSheet
      open={open}
      onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}
      width="xl"
      eyebrow="Security"
      title="Create Virtual Employee"
      description="Create one business identity for model access and approved system capabilities."
      footer={<div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button variant="outline" disabled={mutation.isPending} onClick={() => step ? setStep(step - 1) : onOpenChange(false)}>{step ? <><ArrowLeft /> Back</> : "Cancel"}</Button>
        {step < 4 ? <Button disabled={!canContinue} onClick={() => setStep(step + 1)}>Next: {steps[step + 1]} <ArrowRight /></Button> : <Button disabled={mutation.isPending} onClick={create}><ShieldCheck /> {mutation.isPending ? "Provisioning model access…" : "Create virtual employee"}</Button>}
      </div>}
    >
      <ol className="mb-6 grid grid-cols-5 gap-2" aria-label="Creation steps">{steps.map((label, index) => <li key={label} className={cn("border-t-2 pt-2 text-[11px]", index <= step ? "border-primary font-medium text-foreground" : "border-border text-muted-foreground")}><span className="mr-1 tabular-nums">{index + 1}.</span><span className="hidden sm:inline">{label}</span></li>)}</ol>
      {step === 0 ? <Card><CardHeader><CardTitle>Basic information</CardTitle><CardDescription>Name the business identity and establish ownership.</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" hint="Lowercase letters, numbers, and hyphens."><Input value={draft.name} onChange={(event) => set("name", event.target.value.toLowerCase().replace(/\s+/g, "-"))} placeholder="jupyter-notebook-worker" /></Field>
        <Field label="Display name"><Input value={draft.displayName} onChange={(event) => set("displayName", event.target.value)} placeholder="Jupyter Notebook Worker" /></Field>
        <Field label="Business role"><Input value={draft.businessRole} onChange={(event) => set("businessRole", event.target.value)} placeholder="Data Analysis" /></Field>
        <Field label="Owner team"><Input value={draft.ownerTeamId} onChange={(event) => set("ownerTeamId", event.target.value)} placeholder="Data Platform" /></Field>
        <Field label="Environment"><Select value={draft.environment} onValueChange={(value) => set("environment", value as Draft["environment"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="development">Development</SelectItem><SelectItem value="uat">UAT</SelectItem><SelectItem value="production">Production</SelectItem></SelectContent></Select></Field>
        <Field label="Tags" hint="Comma separated"><Input value={draft.tags} onChange={(event) => set("tags", event.target.value)} placeholder="analytics, notebooks" /></Field>
        <div className="sm:col-span-2"><Field label="Description"><Textarea value={draft.description} onChange={(event) => set("description", event.target.value)} placeholder="Runs approved notebook and data analysis tasks." /></Field></div>
      </CardContent></Card> : null}
      {step === 1 ? <Card><CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="size-5" /> Model access</CardTitle><CardDescription>A dedicated LiteLLM Service Account Key will enforce models, budgets, rate limits, and spend attribution.</CardDescription></CardHeader><CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="LiteLLM team" hint="Leave blank to create or reuse the owner team."><Input value={draft.litellmTeamId} onChange={(event) => set("litellmTeamId", event.target.value)} placeholder="Data Platform" /></Field>
          <Field label="Allowed models" hint="Comma separated model aliases."><Input value={draft.allowedModels} onChange={(event) => set("allowedModels", event.target.value)} placeholder="gpt-5.2, qwen-coder" /></Field>
          <Field label="Access groups"><Input value={draft.accessGroups} onChange={(event) => set("accessGroups", event.target.value)} placeholder="approved-coding-models" /></Field>
          <Field label="Fallback models"><Input value={draft.fallbackModels} onChange={(event) => set("fallbackModels", event.target.value)} placeholder="internal-small-model" /></Field>
          <Field label="Monthly budget (USD)"><Input inputMode="decimal" value={draft.maxBudget} onChange={(event) => set("maxBudget", event.target.value)} /></Field>
          <Field label="Key lifetime"><Select value={draft.keyDuration} onValueChange={(value) => set("keyDuration", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="30d">30 days</SelectItem><SelectItem value="90d">90 days</SelectItem><SelectItem value="180d">180 days</SelectItem><SelectItem value="365d">1 year</SelectItem></SelectContent></Select></Field>
          <Field label="RPM limit"><Input inputMode="numeric" value={draft.rpmLimit} onChange={(event) => set("rpmLimit", event.target.value)} /></Field>
          <Field label="TPM limit"><Input inputMode="numeric" value={draft.tpmLimit} onChange={(event) => set("tpmLimit", event.target.value)} /></Field>
          <Field label="Maximum parallel requests"><Input inputMode="numeric" value={draft.maxParallelRequests} onChange={(event) => set("maxParallelRequests", event.target.value)} /></Field>
        </div>
        <p className="border-l-2 border-primary bg-primary/5 px-4 py-3 text-xs leading-5">The complete key is never stored in a business table or returned by list APIs. TALI writes it to Kubernetes Secret storage; local development uses an ephemeral process-only store.</p>
      </CardContent></Card> : null}
      {step === 2 ? <Card><CardHeader><div className="flex items-center justify-between gap-3"><div><CardTitle>System identities</CardTitle><CardDescription>Attach references only. Never paste a password, token, or OAuth secret.</CardDescription></div><Badge variant="outline">Optional</Badge></div></CardHeader><CardContent className="space-y-4">
        <Field label="Identity type"><Select value={draft.identityType} onValueChange={(value) => set("identityType", value as Draft["identityType"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No system identity</SelectItem><SelectItem value="kubernetes_service_account">Kubernetes ServiceAccount</SelectItem><SelectItem value="functional_id">Functional ID</SelectItem><SelectItem value="oauth_client">OAuth Client</SelectItem><SelectItem value="api_credential">API Credential Reference</SelectItem><SelectItem value="cloud_role">Cloud Role</SelectItem><SelectItem value="custom">Custom Identity Provider</SelectItem></SelectContent></Select></Field>
        {draft.identityType !== "none" ? <div className="grid gap-4 sm:grid-cols-2"><Field label="Display name"><Input value={draft.identityDisplayName} onChange={(event) => set("identityDisplayName", event.target.value)} placeholder="tali-jupyter-worker" /></Field><Field label="Provider / system"><Input value={draft.identityProvider} onChange={(event) => set("identityProvider", event.target.value)} placeholder="Kubernetes" /></Field><div className="sm:col-span-2"><Field label="Credential reference"><Input value={draft.identityReference} onChange={(event) => set("identityReference", event.target.value)} placeholder="k8s://tali-agents/jupyter-worker" /></Field></div></div> : <p className="border border-dashed p-5 text-sm text-muted-foreground">You can attach identities later from the Virtual Employee details page.</p>}
      </CardContent></Card> : null}
      {step === 3 ? <Card><CardHeader><CardTitle>Access scope</CardTitle><CardDescription>Describe approved system access and identify the component that actually enforces it.</CardDescription></CardHeader><CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Resource type"><Input value={draft.resourceType} onChange={(event) => set("resourceType", event.target.value)} placeholder="Kubernetes" /></Field><Field label="Resource"><Input value={draft.resourceId} onChange={(event) => set("resourceId", event.target.value)} placeholder="namespace/data-analysis" /></Field><Field label="Actions" hint="Comma separated"><Input value={draft.actions} onChange={(event) => set("actions", event.target.value)} placeholder="get, list" /></Field><Field label="Enforcement provider"><Select value={draft.enforcementProvider} onValueChange={(value) => set("enforcementProvider", value as Draft["enforcementProvider"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="kubernetes_rbac">Kubernetes RBAC · Enforced</SelectItem><SelectItem value="target_system">Target system · Enforced</SelectItem><SelectItem value="adapter">TALI adapter · Partially enforced</SelectItem><SelectItem value="metadata_only">Metadata only · Not enforced</SelectItem></SelectContent></Select></Field></div>
        <p className="border-l-2 border-amber-500 bg-amber-500/5 px-4 py-3 text-xs leading-5">LiteLLM enforces model scope only. Kubernetes, JupyterHub, MCP, and internal API permissions remain the responsibility of the named enforcement provider.</p>
      </CardContent></Card> : null}
      {step === 4 ? <Card><CardHeader><CardTitle className="flex items-center gap-2"><Check className="size-5" /> Review</CardTitle><CardDescription>TALI creates the business identity first, then provisions LiteLLM and stores the credential. Failed provisioning preserves this configuration for retry.</CardDescription></CardHeader><CardContent className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2"><Summary title="Virtual Employee" rows={[["Name", draft.displayName], ["Identifier", draft.name], ["Owner", draft.ownerTeamId || "Unassigned"], ["Environment", draft.environment]]} /><Summary title="Model access" rows={[["Models", list(draft.allowedModels).join(", ")], ["Access groups", list(draft.accessGroups).join(", ") || "None"], ["Budget", `$${draft.maxBudget || "No limit"} / 30d`], ["Rate limits", `${draft.rpmLimit || "—"} RPM · ${draft.tpmLimit || "—"} TPM`]]} /><Summary title="Backing identities" rows={[["Identity", draft.identityType === "none" ? "None" : draft.identityDisplayName], ["Credential destination", "Kubernetes Secret / ephemeral dev store"]]} /><Summary title="Approved scope" rows={[["Resource", draft.resourceId || "None"], ["Enforcement", draft.resourceId ? draft.enforcementProvider.replaceAll("_", " ") : "Not configured"]]} /></div>
        <Separator />
        <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"><Bot className="mt-0.5 size-4 shrink-0" />Runtime Policy remains an independent OpenShell control and will be selected when an Instance is created.</p>
      </CardContent></Card> : null}
      {mutation.error ? <p role="alert" className="mt-4 border-l-2 border-destructive bg-destructive/5 p-3 text-sm text-destructive">{mutation.error.message}</p> : null}
    </EntityFormSheet>
  );
}

function Field({ children, hint, label }: { children: React.ReactNode; hint?: string; label: string }) {
  return <label className="space-y-2"><Label>{label}</Label>{children}{hint ? <span className="block text-xs leading-5 text-muted-foreground">{hint}</span> : null}</label>;
}

function Summary({ rows, title }: { rows: Array<[string, string]>; title: string }) {
  return <section><h3 className="mb-3 text-sm font-semibold">{title}</h3><dl className="space-y-2">{rows.map(([label, value]) => <div key={label} className="flex items-start justify-between gap-4 text-xs"><dt className="text-muted-foreground">{label}</dt><dd className="max-w-[68%] text-right font-medium">{value}</dd></div>)}</dl></section>;
}
