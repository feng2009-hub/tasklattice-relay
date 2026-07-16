import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  defaultAgentPlatformId,
  sandboxPolicies,
  type AgentPlatformId,
} from "@tasklattice/contracts";
import { ArrowLeft, ArrowRight, Bot, Check, Cpu, LockKeyhole, Network, ServerCog, Sparkles } from "lucide-react";
import { BlueprintRow, CreateInstanceLayout, InstanceBlueprint, type CreateInstanceStep } from "@/components/agents/create-instance-layout";
import { AgentPlatformPicker } from "@/components/agents/agent-platform-picker";
import { PageHeader } from "@/components/layout/page-header";
import { api } from "@/lib/api";
import { mcpServerPreviews, skillPreviews } from "@/lib/preview-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelectCombobox, type MultiSelectOption } from "@/components/ui/multi-select-combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { getAgentPlatformPresentation } from "@/lib/agent-platforms";

export const Route = createFileRoute("/agents/new")({ component: CreateAgent });

const steps: readonly CreateInstanceStep[] = [
  { label: "Identity", description: "Name and instruct the Agent" },
  { label: "Runtime", description: "Choose an Agent platform and model" },
  { label: "Extensions", description: "Attach Skills and MCP" },
  { label: "Review", description: "Confirm and create" },
];

const publishedSkills = skillPreviews.filter((item) => item.status === "PUBLISHED");
const publishedSkillOptions: MultiSelectOption[] = publishedSkills.map((skill) => ({
  value: skill.id,
  label: skill.name,
  description: skill.description,
  meta: `${skill.category} · v${skill.version}`,
}));

function CreateAgent() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [modelDeploymentId, setModelDeploymentId] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [selectedMcps, setSelectedMcps] = useState<string[]>([]);
  const deployments = useQuery({ queryKey: ["model-deployments"], queryFn: api.listModelDeployments });
  const validatedDeployments = (deployments.data ?? []).filter((deployment) => deployment.status === "VALIDATED" && deployment.modelType === "llm");
  const mutation = useMutation({
    mutationFn: api.createAgent,
    onSuccess: (agent) => void navigate({ to: "/agents/$agentId", params: { agentId: agent.id } }),
  });
  const form = useForm({
    defaultValues: {
      name: "",
      description: "",
      runtime: "nemoclaw" as const,
      agentPlatform: defaultAgentPlatformId as AgentPlatformId,
      modelDeploymentId: "",
      policyId: "restricted" as const,
      systemPrompt: "You are a focused internal assistant. Complete the user's request inside the NemoClaw sandbox and explain the evidence clearly.",
    },
    onSubmit: ({ value }) => mutation.mutateAsync(value),
  });
  const selectedDeployment = validatedDeployments.find((deployment) => deployment.id === modelDeploymentId);
  useEffect(() => {
    const first = validatedDeployments[0];
    if (!first || modelDeploymentId) return;
    setModelDeploymentId(first.id);
    form.setFieldValue("modelDeploymentId", first.id);
  }, [form, modelDeploymentId, validatedDeployments]);

  const toggle = (id: string, values: string[], update: (next: string[]) => void) =>
    update(values.includes(id) ? values.filter((item) => item !== id) : [...values, id]);

  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Agent / Instance / Create" title="Create Instance" badge={<Badge variant="outline">UAT</Badge>} description="Build a specialized Agent from a runtime, reusable Skills, and connected MCP tools." />
      <CreateInstanceLayout
        steps={steps}
        currentStep={step}
        onStepChange={setStep}
        blueprint={
          <InstanceBlueprint>
            <BlueprintRow icon={Cpu} label="Runtime" value="NemoClaw" />
            <form.Subscribe selector={(state) => state.values.agentPlatform}>
              {(agentPlatform) => (
                <BlueprintRow
                  icon={Bot}
                  label="Agent platform"
                  value={getAgentPlatformPresentation(agentPlatform).name}
                />
              )}
            </form.Subscribe>
            <BlueprintRow icon={Network} label="Provider" value={selectedDeployment ? `${selectedDeployment.providerName} · ${selectedDeployment.displayName}` : "Required"} />
            <form.Subscribe selector={(state) => state.values.policyId}>{(policyId) => <BlueprintRow icon={LockKeyhole} label="Policy" value={sandboxPolicies.find((policy) => policy.id === policyId)?.name ?? String(policyId)} />}</form.Subscribe>
            <BlueprintRow icon={Sparkles} label="Skills" value={`${selectedSkills.length} selected`} />
            <BlueprintRow icon={ServerCog} label="MCP Servers" value={`${selectedMcps.length} selected`} />
          </InstanceBlueprint>
        }
      >
        <form onSubmit={(event) => { event.preventDefault(); void form.handleSubmit(); }} className="min-w-0 space-y-5">
          {step === 0 ? (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Bot className="size-5" /> Identity</CardTitle><CardDescription>Name the desired Agent resource and define its operating instructions.</CardDescription></CardHeader>
              <CardContent className="space-y-5">
                <form.Field name="name" validators={{ onChange: ({ value }) => value.trim().length < 3 ? "Use at least 3 characters." : undefined }}>
                  {(field) => <div className="space-y-2"><Label htmlFor={field.name}>Agent name</Label><Input id={field.name} value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} placeholder="research-assistant" /><p className="min-h-4 text-xs text-destructive">{field.state.meta.errors.join(" ")}</p></div>}
                </form.Field>
                <form.Field name="description">{(field) => <div className="space-y-2"><Label htmlFor={field.name}>Description <span className="text-muted-foreground">(optional)</span></Label><Input id={field.name} value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} placeholder="Summarizes internal research with citations" /></div>}</form.Field>
                <form.Field name="systemPrompt">{(field) => <div className="space-y-2"><Label htmlFor={field.name}>System instructions</Label><Textarea id={field.name} className="min-h-40" value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} /><div className="text-right text-xs text-muted-foreground">{field.state.value.length} / 8000</div></div>}</form.Field>
              </CardContent>
            </Card>
          ) : null}

          {step === 1 ? (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Cpu className="size-5" /> Runtime & model</CardTitle><CardDescription>The core provisioning flow exposes only validated Provider choices.</CardDescription></CardHeader>
              <CardContent className="space-y-5">
                <form.Field name="agentPlatform">
                  {(field) => (
                    <AgentPlatformPicker
                      value={field.state.value}
                      onValueChange={field.handleChange}
                    />
                  )}
                </form.Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><Label>Agent runtime</Label><div className="flex min-h-12 items-center gap-3 border bg-muted/25 px-3"><img src="/assets/brands/nvidia-logo-square.png" alt="" className="size-6 object-contain" /><span><strong className="block text-sm">NemoClaw</strong><span className="block text-xs text-muted-foreground">OpenShell-managed execution runtime</span></span></div></div>
                  <div className="space-y-2"><Label>LLM deployment</Label><Select value={modelDeploymentId} disabled={!validatedDeployments.length} onValueChange={(value) => { setModelDeploymentId(value); form.setFieldValue("modelDeploymentId", value); }}><SelectTrigger><SelectValue placeholder="Select a validated LLM" /></SelectTrigger><SelectContent>{validatedDeployments.map((deployment) => <SelectItem key={deployment.id} value={deployment.id}>{deployment.providerName} · {deployment.displayName}</SelectItem>)}</SelectContent></Select></div>
                </div>
                {selectedDeployment ? <div className="grid gap-3 border-y py-4 text-xs sm:grid-cols-3"><div><span className="text-muted-foreground">Endpoint</span><strong className="mt-1 block truncate font-mono">{selectedDeployment.endpoint}</strong></div><div><span className="text-muted-foreground">Model</span><strong className="mt-1 block">{selectedDeployment.modelId}</strong></div><div><span className="text-muted-foreground">Cost attribution</span><strong className="mt-1 block">Dedicated Instance key</strong></div></div> : <p role="alert" className="border-l-2 border-amber-500 bg-amber-500/5 px-3 py-3 text-xs">No validated LLM deployment is available. <Link to="/providers" className="font-semibold underline underline-offset-4">Register a Provider and model first.</Link></p>}
                <form.Field name="policyId">
                  {(field) => (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3"><Label>OpenShell policy</Label><Link to="/agent/sandboxes/policy" className="text-xs font-medium underline underline-offset-4">Inspect policies</Link></div>
                      <Select value={field.state.value} onValueChange={(value) => field.handleChange(value as typeof field.state.value)}>
                        <SelectTrigger aria-label="OpenShell policy" className="min-h-12 h-auto"><SelectValue /></SelectTrigger>
                        <SelectContent>{sandboxPolicies.map((policy) => <SelectItem key={policy.id} value={policy.id}>{policy.name} · {policy.networkAccess}</SelectItem>)}</SelectContent>
                      </Select>
                      <p className="text-xs leading-5 text-muted-foreground">Applied at sandbox creation through the OpenShell policy file boundary.</p>
                    </div>
                  )}
                </form.Field>
              </CardContent>
            </Card>
          ) : null}

          {step === 2 ? (
            <div className="space-y-5">
              <Card>
                <CardHeader><div className="flex items-center justify-between gap-3"><div><CardTitle className="flex items-center gap-2"><Sparkles className="size-5" /> Skills</CardTitle><CardDescription className="mt-2">Choose one or more verified capability packages.</CardDescription></div><Badge variant="outline">{selectedSkills.length} selected</Badge></div></CardHeader>
                <CardContent className="space-y-3">
                  <Label htmlFor="instance-skills">Available Skills</Label>
                  <MultiSelectCombobox
                    id="instance-skills"
                    ariaLabel="Select Skills"
                    emptyMessage="No Skills start with"
                    onValueChange={setSelectedSkills}
                    options={publishedSkillOptions}
                    placeholder="Select one or more Skills…"
                    searchPlaceholder="Add another Skill…"
                    value={selectedSkills}
                  />
                  <p className="text-xs leading-5 text-muted-foreground">
                    {publishedSkills.length} published {publishedSkills.length === 1 ? "Skill is" : "Skills are"} available. Type the beginning of a Skill name to filter the list.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><div className="flex items-center justify-between gap-3"><div><CardTitle className="flex items-center gap-2"><ServerCog className="size-5" /> MCP Servers</CardTitle><CardDescription className="mt-2">Choose one or more tool servers for this Agent.</CardDescription></div><Badge variant="outline">{selectedMcps.length} selected</Badge></div></CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  {mcpServerPreviews.map((mcp) => { const active = selectedMcps.includes(mcp.id); return <button key={mcp.id} type="button" aria-pressed={active} onClick={() => toggle(mcp.id, selectedMcps, setSelectedMcps)} className={cn("min-h-28 border p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-2", active && "border-primary bg-primary/5 shadow-[inset_3px_0_0_var(--primary)]")}><span className="flex items-start justify-between gap-3"><span><strong className="block">{mcp.name}</strong><span className="mt-1 block text-[10px] uppercase tracking-wide text-muted-foreground">{mcp.transport} · {mcp.tools} tools</span></span><span className={cn("grid size-6 place-items-center rounded-full border", active && "border-primary bg-primary text-primary-foreground")}>{active ? <Check className="size-3" /> : null}</span></span><span className="mt-3 block truncate font-mono text-xs text-muted-foreground">{mcp.endpoint}</span></button>; })}
                </CardContent>
              </Card>
              <p className="border-l-2 border-primary bg-primary/5 px-4 py-3 text-xs leading-5"><strong>Preview behavior:</strong> selections appear in the review step but are not persisted or installed by the current backend.</p>
            </div>
          ) : null}

          {step === 3 ? (
            <form.Subscribe selector={(state) => state.values}>
              {(values) => (
                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2"><Check className="size-5" /> Review & create</CardTitle><CardDescription>Confirm the runtime blueprint before provisioning the NemoClaw Instance.</CardDescription></CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid gap-5 sm:grid-cols-2">
                      <ReviewSection title="Agent"><ReviewRow label="Name" value={values.name} /><ReviewRow label="Description" value={values.description || "None"} /></ReviewSection>
                      <ReviewSection title="Runtime"><ReviewRow label="Runtime" value="NemoClaw" /><ReviewRow label="Agent platform" value={getAgentPlatformPresentation(values.agentPlatform).name} /><ReviewRow label="Provider" value={selectedDeployment?.providerName ?? "Not selected"} /><ReviewRow label="Model" value={selectedDeployment?.displayName ?? "—"} /><ReviewRow label="Policy" value={sandboxPolicies.find((policy) => policy.id === values.policyId)?.name ?? values.policyId} /></ReviewSection>
                    </div>
                    <Separator />
                    <div className="grid gap-5 sm:grid-cols-2">
                      <ReviewSection title={`Skills (${selectedSkills.length})`}>{selectedSkills.length ? selectedSkills.map((id) => <ReviewPill key={id} label={skillPreviews.find((item) => item.id === id)?.name ?? id} />) : <p className="text-xs text-muted-foreground">No Skills selected</p>}</ReviewSection>
                      <ReviewSection title={`MCP Servers (${selectedMcps.length})`}>{selectedMcps.length ? selectedMcps.map((id) => <ReviewPill key={id} label={mcpServerPreviews.find((item) => item.id === id)?.name ?? id} />) : <p className="text-xs text-muted-foreground">No MCP servers selected</p>}</ReviewSection>
                    </div>
                    <p className="border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">The Instance will be created through the existing backend. Extension attachment is visual-only in this iteration and will not be included in the request payload.</p>
                  </CardContent>
                </Card>
              )}
            </form.Subscribe>
          ) : null}

          {mutation.error ? <p className="border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{mutation.error.message}</p> : null}
          <div className="flex items-center justify-between gap-3">
            <Button type="button" variant="outline" disabled={step === 0 || mutation.isPending} onClick={() => setStep((current) => Math.max(0, current - 1))}><ArrowLeft /> Back</Button>
            {step < 3 ? (
              <form.Subscribe selector={(state) => [state.values.name, state.values.systemPrompt, state.values.modelDeploymentId]}>
                {([name, prompt, connection]) => <Button type="button" disabled={(step === 0 && (String(name).trim().length < 3 || String(prompt).trim().length < 10)) || (step === 1 && !String(connection))} onClick={() => setStep((current) => Math.min(3, current + 1))}>Continue <ArrowRight /></Button>}
              </form.Subscribe>
            ) : (
              <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>{([canSubmit, isSubmitting]) => <Button size="lg" type="submit" disabled={!canSubmit || Boolean(isSubmitting) || mutation.isPending}>{mutation.isPending ? "Creating NemoClaw sandbox…" : "Create Instance"}</Button>}</form.Subscribe>
            )}
          </div>
        </form>
      </CreateInstanceLayout>
    </div>
  );
}

function ReviewSection({ children, title }: { children: ReactNode; title: string }) {
  return <section><h3 className="mb-3 text-sm font-semibold">{title}</h3><div className="space-y-2">{children}</div></section>;
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-4 text-xs"><span className="text-muted-foreground">{label}</span><strong className="max-w-[70%] break-words text-right">{value}</strong></div>;
}

function ReviewPill({ label }: { label: string }) {
  return <span className="mr-2 inline-flex min-h-8 items-center border bg-muted/40 px-3 text-xs font-medium">{label}</span>;
}
