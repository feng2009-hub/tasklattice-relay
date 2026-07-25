import { useState, type ReactNode } from "react";
import type { CreateVirtualEmployeeInput, VirtualEmployee } from "@tasklattice/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Bot, Check, KeyRound, ShieldCheck } from "lucide-react";
import { EntitySheet } from "@/components/shared/entity-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useProjectQueryScope } from "@/hooks/use-project-query-scope";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type Draft = {
  name: string;
  displayName: string;
  description: string;
  businessRole: string;
  ownerTeamId: string;
  environment: "development" | "uat" | "production";
  tags: string;
  allowedModels: string;
  accessGroups: string;
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
  allowedModels: "", accessGroups: "", fallbackModels: "",
  identityType: "none", identityDisplayName: "", identityProvider: "", identityReference: "",
  resourceType: "", resourceId: "", actions: "", enforcementProvider: "metadata_only",
};

function list(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export function CreateVirtualEmployeeSheet({
  onCreated,
  onOpenChange,
  open,
}: {
  onCreated?: (employee: VirtualEmployee) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const scope = useProjectQueryScope();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const steps = ["Basic information", "Model access", "System identities", "Access scope", "Review"];
  const mutation = useMutation({
    mutationFn: (input: CreateVirtualEmployeeInput) => api.createVirtualEmployee(input),
    onSuccess: (employee) => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: scope.key("virtual-employees") }),
        queryClient.invalidateQueries({ queryKey: ["project", employee.projectId, "members"] }),
      ]);
      setDraft(initialDraft);
      setStep(0);
      onOpenChange(false);
      onCreated?.(employee);
    },
  });
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const canContinue = step === 0
    ? /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.name) && draft.displayName.trim().length >= 2
    : step === 1
      ? list(draft.allowedModels).length > 0
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
      allowedModels: list(draft.allowedModels),
      accessGroups: list(draft.accessGroups),
      budgetDuration: "30d",
      keyDuration: "90d",
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
    <EntitySheet
      open={open}
      onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}
      width="xl"
      eyebrow="Security"
      title="Create Virtual Employee"
      description="Add a virtual teammate with its own model access and approved system capabilities."
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
      {step === 1 ? <Card><CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="size-5" /> Model access</CardTitle><CardDescription>Choose the model scope for this business identity. Each Instance receives an independent key under the Project LiteLLM Team.</CardDescription></CardHeader><CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Allowed models" hint="Comma separated model aliases."><Input value={draft.allowedModels} onChange={(event) => set("allowedModels", event.target.value)} placeholder="gpt-5.2, qwen-coder" /></Field>
          <Field label="Access groups"><Input value={draft.accessGroups} onChange={(event) => set("accessGroups", event.target.value)} placeholder="approved-coding-models" /></Field>
          <Field label="Fallback models"><Input value={draft.fallbackModels} onChange={(event) => set("fallbackModels", event.target.value)} placeholder="internal-small-model" /></Field>
        </div>
        <p className="border-l-2 border-primary bg-primary/5 px-4 py-3 text-xs leading-5">The Virtual Employee has no shared model credential. Instance keys carry Project, Virtual Employee, and Instance attribution metadata and are revoked independently.</p>
      </CardContent></Card> : null}
      {step === 2 ? <Card><CardHeader><div className="flex items-center justify-between gap-3"><div><CardTitle>System identities</CardTitle><CardDescription>Attach references only. Never paste a password, token, or OAuth secret.</CardDescription></div><Badge variant="outline">Optional</Badge></div></CardHeader><CardContent className="space-y-4">
        <Field label="Identity type"><Select value={draft.identityType} onValueChange={(value) => set("identityType", value as Draft["identityType"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No system identity</SelectItem><SelectItem value="kubernetes_service_account">Kubernetes ServiceAccount</SelectItem><SelectItem value="functional_id">Functional ID</SelectItem><SelectItem value="oauth_client">OAuth Client</SelectItem><SelectItem value="api_credential">API Credential Reference</SelectItem><SelectItem value="cloud_role">Cloud Role</SelectItem><SelectItem value="custom">Custom Identity Provider</SelectItem></SelectContent></Select></Field>
        {draft.identityType !== "none" ? <div className="grid gap-4 sm:grid-cols-2"><Field label="Display name"><Input value={draft.identityDisplayName} onChange={(event) => set("identityDisplayName", event.target.value)} placeholder="tali-jupyter-worker" /></Field><Field label="Provider / system"><Input value={draft.identityProvider} onChange={(event) => set("identityProvider", event.target.value)} placeholder="Kubernetes" /></Field><div className="sm:col-span-2"><Field label="Credential reference"><Input value={draft.identityReference} onChange={(event) => set("identityReference", event.target.value)} placeholder="k8s://tali-agents/jupyter-worker" /></Field></div></div> : <p className="border border-dashed p-5 text-sm text-muted-foreground">You can attach identities later from the Virtual Employee details page.</p>}
      </CardContent></Card> : null}
      {step === 3 ? <Card><CardHeader><CardTitle>Access scope</CardTitle><CardDescription>Describe approved system access and identify the component that actually enforces it.</CardDescription></CardHeader><CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Resource type"><Input value={draft.resourceType} onChange={(event) => set("resourceType", event.target.value)} placeholder="Kubernetes" /></Field><Field label="Resource"><Input value={draft.resourceId} onChange={(event) => set("resourceId", event.target.value)} placeholder="namespace/data-analysis" /></Field><Field label="Actions" hint="Comma separated"><Input value={draft.actions} onChange={(event) => set("actions", event.target.value)} placeholder="get, list" /></Field><Field label="Enforcement provider"><Select value={draft.enforcementProvider} onValueChange={(value) => set("enforcementProvider", value as Draft["enforcementProvider"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="kubernetes_rbac">Kubernetes RBAC · Enforced</SelectItem><SelectItem value="target_system">Target system · Enforced</SelectItem><SelectItem value="adapter">TALI adapter · Partially enforced</SelectItem><SelectItem value="metadata_only">Metadata only · Not enforced</SelectItem></SelectContent></Select></Field></div>
        <p className="border-l-2 border-amber-500 bg-amber-500/5 px-4 py-3 text-xs leading-5">LiteLLM enforces model scope only. Kubernetes, JupyterHub, MCP, and internal API permissions remain the responsibility of the named enforcement provider.</p>
      </CardContent></Card> : null}
      {step === 4 ? <Card><CardHeader><CardTitle className="flex items-center gap-2"><Check className="size-5" /> Review</CardTitle><CardDescription>TALI creates the business identity and maps it to the Project Team. Failed synchronization preserves this configuration for retry.</CardDescription></CardHeader><CardContent className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2"><Summary title="Virtual Employee" rows={[["Name", draft.displayName], ["Identifier", draft.name], ["Owner", draft.ownerTeamId || "Unassigned"], ["Environment", draft.environment]]} /><Summary title="Model access" rows={[["Models", list(draft.allowedModels).join(", ")], ["Access groups", list(draft.accessGroups).join(", ") || "None"], ["Quota", "Inherited from Project"]]} /><Summary title="Backing identities" rows={[["Identity", draft.identityType === "none" ? "None" : draft.identityDisplayName], ["Model credential", "Issued per Instance"]]} /><Summary title="Approved scope" rows={[["Resource", draft.resourceId || "None"], ["Enforcement", draft.resourceId ? draft.enforcementProvider.replaceAll("_", " ") : "Not configured"]]} /></div>
        <Separator />
        <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"><Bot className="mt-0.5 size-4 shrink-0" />Runtime Policy remains an independent OpenShell control and will be selected when an Instance is created.</p>
      </CardContent></Card> : null}
      {mutation.error ? <p role="alert" className="mt-4 border-l-2 border-destructive bg-destructive/5 p-3 text-sm text-destructive">{mutation.error.message}</p> : null}
    </EntitySheet>
  );
}

function Field({ children, hint, label }: { children: ReactNode; hint?: string; label: string }) {
  return <label className="space-y-2"><Label>{label}</Label>{children}{hint ? <span className="block text-xs leading-5 text-muted-foreground">{hint}</span> : null}</label>;
}

function Summary({ rows, title }: { rows: Array<[string, string]>; title: string }) {
  return <section><h3 className="mb-3 text-sm font-semibold">{title}</h3><dl className="space-y-2">{rows.map(([label, value]) => <div key={label} className="flex items-start justify-between gap-4 text-xs"><dt className="text-muted-foreground">{label}</dt><dd className="max-w-[68%] text-right font-medium">{value}</dd></div>)}</dl></section>;
}
