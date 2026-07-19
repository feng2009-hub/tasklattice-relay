import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { defaultAgentPlatformId, type AgentPlatformId, type CreateAgentInput } from "@tasklattice/contracts";
import { ArrowLeft, ArrowRight, Bot, Check, CircleAlert } from "lucide-react";
import { AgentSelect } from "@/components/agents/agent-select";
import { ChangeSpecializationDialog } from "@/components/agents/change-specialization-dialog";
import {
  changeSpecializationSelection,
  previewSpecializationChange,
  updateCapabilitySelection,
  type SelectedCapability,
} from "@/components/agents/capability-selection";
import { CreateInstanceLayout, type CreateInstanceStep } from "@/components/agents/create-instance-layout";
import { IdentityCapabilitiesStep } from "@/components/agents/identity-capabilities-step";
import { getSpecialization, type SpecializationId } from "@/components/agents/specializations";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { api } from "@/lib/api";
import { getAgentPlatformPresentation } from "@/lib/agent-platforms";

export const Route = createFileRoute("/agents/instace/new")({ component: CreateInstance });

const steps: readonly CreateInstanceStep[] = [
  { label: "Identity & Capabilities", description: "Define the Agent and its capabilities" },
  { label: "Runtime & Model", description: "Choose runtime, model and provider" },
  { label: "Review & Create", description: "Confirm and create the Agent" },
];

function capabilityName(id: string, skills: readonly { id: string; name: string }[], mcpServers: readonly { id: string; name: string }[]): string {
  return skills.find((item) => item.id === id)?.name
    ?? mcpServers.find((item) => item.id === id)?.name
    ?? id;
}

function selectedIds(items: readonly SelectedCapability[]): string[] {
  return items.map((item) => item.id);
}

function CreateInstance() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [modelDeploymentId, setModelDeploymentId] = useState("");
  const [specializationId, setSpecializationId] = useState<SpecializationId>("general-purpose");
  const [customSystemPrompt, setCustomSystemPrompt] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<SelectedCapability[]>([]);
  const [selectedMcps, setSelectedMcps] = useState<SelectedCapability[]>([]);
  const [selectedKnowledgeSources, setSelectedKnowledgeSources] = useState<SelectedCapability[]>([]);
  const [skillsTouched, setSkillsTouched] = useState(false);
  const [mcpsTouched, setMcpsTouched] = useState(false);
  const [pendingSpecializationId, setPendingSpecializationId] = useState<SpecializationId | null>(null);
  const extensionCatalog = useQuery({ queryKey: ["extension-catalog"], queryFn: api.getExtensionCatalog });
  const skills = extensionCatalog.data?.skills ?? [];
  const mcpServers = extensionCatalog.data?.mcpServers ?? [];
  const knowledgeSources = extensionCatalog.data?.knowledgeSources ?? [];
  const specializations = extensionCatalog.data?.specializations ?? [];
  const specialization = getSpecialization(specializations, specializationId);
  const pendingSpecialization = pendingSpecializationId ? getSpecialization(specializations, pendingSpecializationId) : null;
  const deployments = useQuery({ queryKey: ["model-deployments"], queryFn: api.listModelDeployments });
  const policies = useQuery({ queryKey: ["sandbox-policies"], queryFn: api.listPolicies });
  const validatedDeployments = (deployments.data ?? []).filter((deployment) => deployment.status === "VALIDATED" && deployment.modelType === "llm");
  const selectedDeployment = validatedDeployments.find((deployment) => deployment.id === modelDeploymentId);
  const currentSystemPrompt = specialization?.id === "custom" ? customSystemPrompt : specialization?.systemPrompt ?? "";
  const incompleteMcps = selectedIds(selectedMcps)
    .map((id) => mcpServers.find((item) => item.id === id))
    .filter((item) => item && item.status !== "HEALTHY");
  const mutation = useMutation({
    mutationFn: api.createAgent,
    onSuccess: (agent) => void navigate({ to: "/agents/$agentId", params: { agentId: agent.id }, search: { creating: true } }),
  });
  const form = useForm({
    defaultValues: {
      name: "",
      description: "",
      runtime: "openshell" as const,
      agentPlatform: defaultAgentPlatformId as AgentPlatformId,
      modelDeploymentId: "",
      policyId: "",
      systemPrompt: "",
    },
    onSubmit: ({ value }) => mutation.mutateAsync({
      ...value,
      systemPrompt: currentSystemPrompt,
      specializationId,
      skillIds: selectedIds(selectedSkills),
      mcpServerIds: selectedIds(selectedMcps),
      knowledgeSourceIds: selectedIds(selectedKnowledgeSources),
    } satisfies CreateAgentInput),
  });

  useEffect(() => {
    if (!policies.data?.defaultPolicyId || form.state.values.policyId) return;
    form.setFieldValue("policyId", policies.data.defaultPolicyId);
  }, [form, policies.data?.defaultPolicyId]);

  useEffect(() => {
    if (!specialization || form.state.values.systemPrompt) return;
    form.setFieldValue("systemPrompt", specialization.systemPrompt);
  }, [form, specialization]);

  const policyName = (id: string) => policies.data?.policies.find((policy) => policy.id === id)?.name ?? (id || "Required");

  const applySpecialization = (id: SpecializationId) => {
    const next = getSpecialization(specializations, id);
    if (!next) return;
    const nextSkills = changeSpecializationSelection(selectedSkills, next.defaultSkillIds);
    const nextMcps = changeSpecializationSelection(selectedMcps, next.defaultMcpServerIds);
    setSpecializationId(id);
    setSelectedSkills(nextSkills);
    setSelectedMcps(nextMcps);
    setSelectedKnowledgeSources(changeSpecializationSelection(selectedKnowledgeSources, next.defaultKnowledgeSourceIds));
    setSkillsTouched(nextSkills.some((item) => item.source === "manual"));
    setMcpsTouched(nextMcps.some((item) => item.source === "manual"));
    form.setFieldValue("systemPrompt", id === "custom" ? customSystemPrompt : next.systemPrompt);
    setPendingSpecializationId(null);
  };

  const requestSpecializationChange = (id: SpecializationId) => {
    if (id === specializationId) return;
    if (skillsTouched || mcpsTouched) setPendingSpecializationId(id);
    else applySpecialization(id);
  };

  const pendingChange = useMemo(() => {
    if (!pendingSpecialization) return { add: [], keep: [], remove: [] };
    const skillChange = previewSpecializationChange(selectedSkills, pendingSpecialization.defaultSkillIds);
    const mcpChange = previewSpecializationChange(selectedMcps, pendingSpecialization.defaultMcpServerIds);
    return {
      add: [...skillChange.add, ...mcpChange.add].map((id) => capabilityName(id, skills, mcpServers)),
      keep: [...skillChange.keep, ...mcpChange.keep].map((id) => capabilityName(id, skills, mcpServers)),
      remove: [...skillChange.remove, ...mcpChange.remove].map((id) => capabilityName(id, skills, mcpServers)),
    };
  }, [mcpServers, pendingSpecialization, selectedMcps, selectedSkills, skills]);

  if (extensionCatalog.isPending)
    return <div className="flex min-h-72 items-center justify-center border text-sm text-muted-foreground">Loading Roles and extension catalog from SQLite…</div>;
  if (extensionCatalog.error)
    return <p role="alert" className="border-l-2 border-destructive bg-destructive/5 p-4 text-sm text-destructive">{extensionCatalog.error.message}</p>;
  if (!specialization)
    return <p role="alert" className="border-l-2 border-destructive bg-destructive/5 p-4 text-sm text-destructive">The SQLite catalog does not contain an Agent Role.</p>;

  return (
    <div className="space-y-7">
      <CreateInstanceLayout
        steps={steps}
        currentStep={step}
        onStepChange={setStep}
      >
        <form onSubmit={(event) => { event.preventDefault(); void form.handleSubmit(); }} className="min-w-0 space-y-5">
          {step === 0 ? (
            <form.Subscribe selector={(state) => state.values.name}>
              {(name) => (
                <IdentityCapabilitiesStep
                  name={String(name)}
                  specialization={specialization}
                  specializations={specializations}
                  skills={skills}
                  mcpServers={mcpServers}
                  knowledgeSources={knowledgeSources}
                  customSystemPrompt={customSystemPrompt}
                  selectedSkillIds={selectedIds(selectedSkills)}
                  selectedMcpServerIds={selectedIds(selectedMcps)}
                  selectedKnowledgeSourceIds={selectedIds(selectedKnowledgeSources)}
                  onNameChange={(value) => form.setFieldValue("name", value)}
                  onCustomSystemPromptChange={(value) => { setCustomSystemPrompt(value); form.setFieldValue("systemPrompt", value); }}
                  onSpecializationChange={requestSpecializationChange}
                  onSkillIdsChange={(ids) => { setSelectedSkills(updateCapabilitySelection(selectedSkills, ids)); setSkillsTouched(true); }}
                  onMcpServerIdsChange={(ids) => { setSelectedMcps(updateCapabilitySelection(selectedMcps, ids)); setMcpsTouched(true); }}
                  onKnowledgeSourceIdsChange={(ids) => setSelectedKnowledgeSources(updateCapabilitySelection(selectedKnowledgeSources, ids))}
                />
              )}
            </form.Subscribe>
          ) : null}

          {step === 1 ? (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Bot className="size-5" /> Runtime & Model</CardTitle><CardDescription>Choose the Agent implementation, validated model, and OpenShell policy used for this Instance.</CardDescription></CardHeader>
              <CardContent className="space-y-5">
                <div className="rounded-md border bg-muted/20 px-4 py-3 text-sm"><span className="text-xs text-muted-foreground">Runtime</span><strong className="mt-1 block">OpenShell (UAT)</strong></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <form.Field name="agentPlatform">
                    {(field) => <div className="space-y-2"><Label htmlFor="instance-agent">Agent implementation</Label><AgentSelect id="instance-agent" value={field.state.value} onValueChange={field.handleChange} /><p className="text-xs leading-5 text-muted-foreground">Configured inside the OpenShell runtime during provisioning.</p></div>}
                  </form.Field>
                  <div className="space-y-2"><Label>LLM deployment</Label><Select value={modelDeploymentId} disabled={!validatedDeployments.length} onValueChange={(value) => { setModelDeploymentId(value); form.setFieldValue("modelDeploymentId", value); }}><SelectTrigger className="min-h-12 h-auto"><SelectValue placeholder="Select a validated LLM" /></SelectTrigger><SelectContent>{validatedDeployments.map((deployment) => <SelectItem key={deployment.id} value={deployment.id}>{deployment.providerName} · {deployment.displayName}</SelectItem>)}</SelectContent></Select></div>
                </div>
                {selectedDeployment ? <div className="grid gap-3 border-y py-4 text-xs sm:grid-cols-3"><div><span className="text-muted-foreground">Endpoint</span><strong className="mt-1 block truncate font-mono">{selectedDeployment.endpoint}</strong></div><div><span className="text-muted-foreground">Model</span><strong className="mt-1 block">{selectedDeployment.modelId}</strong></div><div><span className="text-muted-foreground">Cost attribution</span><strong className="mt-1 block">Dedicated Instance key</strong></div></div> : <p role="alert" className="border-l-2 border-amber-500 bg-amber-500/5 px-3 py-3 text-xs">No model selected. {!validatedDeployments.length ? <><Link to="/providers" className="font-semibold underline underline-offset-4">Register a Provider and model first.</Link></> : "Choose a validated deployment to continue."}</p>}
                <form.Field name="policyId">
                  {(field) => <div className="space-y-2"><div className="flex items-center justify-between gap-3"><Label>OpenShell policy</Label><Link to="/agent/sandboxes/policy" className="text-xs font-medium underline underline-offset-4">Inspect policies</Link></div><Select value={field.state.value} disabled={policies.isPending || Boolean(policies.error)} onValueChange={field.handleChange}><SelectTrigger aria-label="OpenShell policy" className="min-h-12 h-auto"><SelectValue placeholder={policies.isPending ? "Loading Policy catalog…" : "Select a Policy"} /></SelectTrigger><SelectContent>{policies.data?.policies.map((policy) => <SelectItem key={policy.id} value={policy.id}>{policy.name} · {policy.networkAccess}</SelectItem>)}</SelectContent></Select>{policies.error ? <p role="alert" className="text-xs text-destructive">{policies.error.message}</p> : <p className="text-xs leading-5 text-muted-foreground">Applied at Sandbox creation through the OpenShell policy boundary.</p>}</div>}
                </form.Field>
              </CardContent>
            </Card>
          ) : null}

          {step === 2 ? (
            <form.Subscribe selector={(state) => state.values}>
              {(values) => (
                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2"><Check className="size-5" /> Review & Create</CardTitle><CardDescription>Confirm the specialized Agent and OpenShell runtime blueprint before provisioning.</CardDescription></CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid gap-5 sm:grid-cols-2">
                      <ReviewSection title="Identity"><ReviewRow label="Name" value={values.name} /><ReviewRow label="Role" value={specialization.name} /><ReviewRow label="System instructions" value={specialization.id === "custom" ? "Custom instructions" : `Managed by ${specialization.name}`} /></ReviewSection>
                      <ReviewSection title="Runtime & Model"><ReviewRow label="Runtime" value="OpenShell (UAT)" /><ReviewRow label="Agent" value={getAgentPlatformPresentation(values.agentPlatform).name} /><ReviewRow label="Provider" value={selectedDeployment?.providerName ?? "Not selected"} /><ReviewRow label="Model" value={selectedDeployment?.displayName ?? "Not selected"} /><ReviewRow label="Policy" value={policyName(values.policyId)} /></ReviewSection>
                    </div>
                    <Separator />
                    <div className="grid gap-5 lg:grid-cols-3">
                      <ReviewSection title={`Skills (${selectedSkills.length})`}>{selectedSkills.length ? selectedSkills.map((item) => <ReviewPill key={item.id} label={capabilityName(item.id, skills, mcpServers)} />) : <EmptyReview label="No Skills selected" />}</ReviewSection>
                      <ReviewSection title={`MCP Servers (${selectedMcps.length})`}>{selectedMcps.length ? selectedMcps.map((item) => <ReviewPill key={item.id} label={capabilityName(item.id, skills, mcpServers)} />) : <EmptyReview label="No MCP Servers selected" />}</ReviewSection>
                      <ReviewSection title={`Knowledge (${selectedKnowledgeSources.length})`}>{selectedKnowledgeSources.length ? selectedKnowledgeSources.map((item) => <ReviewPill key={item.id} label={knowledgeSources.find((source) => source.id === item.id)?.name ?? item.id} />) : <EmptyReview label="No Knowledge selected" />}</ReviewSection>
                    </div>
                    {incompleteMcps.length ? <p role="alert" className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-5"><CircleAlert className="mt-0.5 size-4 shrink-0" />Complete the connection or access request for {incompleteMcps.map((item) => item?.name).join(", ")} before relying on those tools.</p> : null}
                    <p className="border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">Role and capability references are saved with this Instance. Runtime provisioning remains asynchronous and connected extension services govern final attachment.</p>
                  </CardContent>
                </Card>
              )}
            </form.Subscribe>
          ) : null}

          {mutation.error ? <p role="alert" className="border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{mutation.error.message}</p> : null}
          <div className="flex items-center justify-between gap-3 pt-2">
            {step === 0 ? <Button asChild variant="outline"><Link to="/agents"><ArrowLeft /> Back</Link></Button> : <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => setStep((current) => Math.max(0, current - 1))}><ArrowLeft /> Back</Button>}
            {step === 0 ? (
              <form.Subscribe selector={(state) => state.values.name}>
                {(name) => <Button type="button" disabled={String(name).trim().length < 3 || currentSystemPrompt.trim().length < 10} onClick={() => setStep(1)}>Next: Runtime & Model <ArrowRight /></Button>}
              </form.Subscribe>
            ) : step === 1 ? (
              <form.Subscribe selector={(state) => state.values.policyId}>
                {(policyId) => <Button type="button" disabled={!modelDeploymentId || !String(policyId)} onClick={() => setStep(2)}>Next: Review & Create <ArrowRight /></Button>}
              </form.Subscribe>
            ) : (
              <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting, state.values.policyId]}>{([canSubmit, isSubmitting, policyId]) => <Button size="lg" type="submit" disabled={!canSubmit || Boolean(isSubmitting) || mutation.isPending || !modelDeploymentId || !String(policyId)}>{mutation.isPending ? "Creating OpenShell sandbox…" : "Create Instance"}</Button>}</form.Subscribe>
            )}
          </div>
        </form>
      </CreateInstanceLayout>

      {pendingSpecialization ? <ChangeSpecializationDialog open add={pendingChange.add} keep={pendingChange.keep} remove={pendingChange.remove} fromName={specialization.name} toName={pendingSpecialization.name} onCancel={() => setPendingSpecializationId(null)} onConfirm={() => applySpecialization(pendingSpecialization.id)} /> : null}
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
  return <span className="mr-1.5 inline-flex min-h-8 items-center rounded-sm border bg-muted/40 px-2.5 text-xs font-medium">{label}</span>;
}

function EmptyReview({ label }: { label: string }) {
  return <p className="text-xs text-muted-foreground">{label}</p>;
}
