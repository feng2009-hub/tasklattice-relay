import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { defaultAgentPlatformId, type AgentPlatformId, type CreateAgentInput } from "@tasklattice/contracts";
import { ArrowLeft, ArrowRight, Bot, Check, CircleAlert, CircleHelp, ExternalLink, ShieldCheck, UserRoundCheck } from "lucide-react";
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
import { EntitySheet } from "@/components/shared/entity-sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import { getAgentPlatformPresentation } from "@/lib/agent-platforms";
import { useProjectQueryScope } from "@/hooks/use-project-query-scope";
import { useCurrentProjectId } from "@/hooks/use-project";

const steps: readonly CreateInstanceStep[] = [
  { label: "Define Work", description: "Set the job and extensions" },
  { label: "Identity & Workbench", description: "Assign identity and runtime" },
  { label: "Review & Approve", description: "Evaluate and confirm" },
];

function capabilityName(id: string, skills: readonly { id: string; name: string }[], mcpServers: readonly { id: string; name: string }[]): string {
  return skills.find((item) => item.id === id)?.name
    ?? mcpServers.find((item) => item.id === id)?.name
    ?? id;
}

function selectedIds(items: readonly SelectedCapability[]): string[] {
  return items.map((item) => item.id);
}

export function CreateInstanceSheet({
  initialAgentPlatform = defaultAgentPlatformId,
  initialSpecializationId = "general-purpose",
  onOpenChange,
  open,
}: {
  initialAgentPlatform?: AgentPlatformId;
  initialSpecializationId?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const navigate = useNavigate();
  const projectId = useCurrentProjectId();
  const scope = useProjectQueryScope();
  const [step, setStep] = useState(0);
  const [specializationId, setSpecializationId] = useState<SpecializationId>(
    initialSpecializationId,
  );
  const [customSystemPrompt, setCustomSystemPrompt] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [systemPromptInitialized, setSystemPromptInitialized] = useState(false);
  const [selectedSkills, setSelectedSkills] = useState<SelectedCapability[]>([]);
  const [selectedMcps, setSelectedMcps] = useState<SelectedCapability[]>([]);
  const [selectedKnowledgeSources, setSelectedKnowledgeSources] = useState<SelectedCapability[]>([]);
  const [skillsTouched, setSkillsTouched] = useState(false);
  const [mcpsTouched, setMcpsTouched] = useState(false);
  const [pendingSpecializationId, setPendingSpecializationId] = useState<SpecializationId | null>(null);
  const resourceCatalog = useQuery({ queryKey: scope.key("resource-catalog"), queryFn: api.getResourceCatalog });
  const skills = resourceCatalog.data?.skills ?? [];
  const mcpServers = resourceCatalog.data?.mcpServers ?? [];
  const knowledgeSources = resourceCatalog.data?.knowledgeSources ?? [];
  const specializations = resourceCatalog.data?.specializations ?? [];
  const specialization = getSpecialization(specializations, specializationId);
  const pendingSpecialization = pendingSpecializationId ? getSpecialization(specializations, pendingSpecializationId) : null;
  const virtualEmployees = useQuery({ queryKey: scope.key("virtual-employees"), queryFn: api.listVirtualEmployees });
  const activeVirtualEmployees = (virtualEmployees.data ?? []).filter((employee) => employee.status === "active");
  const accessPolicies = useQuery({ queryKey: scope.key("access-policies"), queryFn: api.listAccessPolicies });
  const policies = useQuery({ queryKey: scope.key("sandbox-policies"), queryFn: api.listPolicies });
  const currentSystemPrompt = systemPrompt;
  const incompleteMcps = selectedIds(selectedMcps)
    .map((id) => mcpServers.find((item) => item.id === id))
    .filter((item) => item && item.status !== "HEALTHY");
  const mutation = useMutation({
    mutationFn: api.createAgent,
    onSuccess: (agent) => {
      void navigate({ to: "/$projectId/instances/$instanceId", params: { projectId, instanceId: agent.id }, search: { creating: true } });
    },
  });
  const form = useForm({
    defaultValues: {
      name: "",
      description: "",
      agentPlatform: initialAgentPlatform,
      policyId: "",
      virtualEmployeeId: "",
    },
    onSubmit: ({ value }) => mutation.mutateAsync({
      ...value,
      runtime: "openshell",
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
    if (!specialization || systemPromptInitialized) return;
    setSystemPrompt(specialization.id === "custom" ? customSystemPrompt : specialization.systemPrompt);
    setSystemPromptInitialized(true);
  }, [customSystemPrompt, specialization, systemPromptInitialized]);

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
    setSystemPrompt(id === "custom" ? customSystemPrompt : next.systemPrompt);
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

  const shellProps = {
    description: "Configure an Agent Instance for a specific job.",
    eyebrow: "Agent Instance",
    onOpenChange: (next: boolean) => !mutation.isPending && onOpenChange(next),
    open,
    title: "Create Instance",
    width: "xl" as const,
  };

  if (resourceCatalog.isPending)
    return <EntitySheet {...shellProps} footer={<Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>}><div className="flex min-h-72 items-center justify-center border text-sm text-muted-foreground">Loading Roles and resource catalog from PostgreSQL…</div></EntitySheet>;
  if (resourceCatalog.error)
    return <EntitySheet {...shellProps} footer={<Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>}><p role="alert" className="border-l-2 border-destructive bg-destructive/5 p-4 text-sm text-destructive">{resourceCatalog.error.message}</p></EntitySheet>;
  if (!specialization)
    return <EntitySheet {...shellProps} footer={<Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>}><p role="alert" className="border-l-2 border-destructive bg-destructive/5 p-4 text-sm text-destructive">The PostgreSQL catalog does not contain an Agent Role.</p></EntitySheet>;

  return (
    <>
    <EntitySheet
      {...shellProps}
      footer={(
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          {step === 0 ? <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => onOpenChange(false)}>Cancel</Button> : <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => setStep((current) => Math.max(0, current - 1))}><ArrowLeft /> Back</Button>}
          {step === 0 ? (
            <form.Subscribe selector={(state) => state.values.name}>
              {(name) => <Button type="button" disabled={String(name).trim().length < 3 || currentSystemPrompt.trim().length < 10} onClick={() => setStep(1)}>Next: Identity & Workbench <ArrowRight /></Button>}
            </form.Subscribe>
          ) : step === 1 ? (
            <form.Subscribe selector={(state) => state.values.policyId}>
              {(policyId) => <form.Subscribe selector={(state) => state.values.virtualEmployeeId}>{(virtualEmployeeId) => <Button key="next-review" type="button" disabled={!String(virtualEmployeeId) || !String(policyId)} onClick={() => setStep(2)}>Next: Review <ArrowRight /></Button>}</form.Subscribe>}
            </form.Subscribe>
          ) : (
            <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting, state.values.policyId, state.values.virtualEmployeeId]}>{([canSubmit, isSubmitting, policyId, virtualEmployeeId]) => <Button key="approve-create" type="button" disabled={!canSubmit || Boolean(isSubmitting) || mutation.isPending || !String(virtualEmployeeId) || !String(policyId)} onClick={() => void form.handleSubmit()}><ShieldCheck /> {mutation.isPending ? "Creating Instance…" : "Approve and Create"}</Button>}</form.Subscribe>
          )}
        </div>
      )}
    >
      <CreateInstanceLayout
        steps={steps}
        currentStep={step}
        onStepChange={setStep}
      >
        <form onSubmit={(event) => event.preventDefault()} className="min-w-0 space-y-5">
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
                  onCustomSystemPromptChange={(value) => { setCustomSystemPrompt(value); setSystemPrompt(value); }}
                  onSpecializationChange={requestSpecializationChange}
                  onSystemPromptChange={setSystemPrompt}
                  systemPrompt={currentSystemPrompt}
                  onSkillIdsChange={(ids) => { setSelectedSkills(updateCapabilitySelection(selectedSkills, ids)); setSkillsTouched(true); }}
                  onMcpServerIdsChange={(ids) => { setSelectedMcps(updateCapabilitySelection(selectedMcps, ids)); setMcpsTouched(true); }}
                  onKnowledgeSourceIdsChange={(ids) => setSelectedKnowledgeSources(updateCapabilitySelection(selectedKnowledgeSources, ids))}
                />
              )}
            </form.Subscribe>
          ) : null}

          {step === 1 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Bot className="size-5" /> Identity & Workbench</CardTitle>
                <CardDescription>Bind the permission identity, Agent workbench, and Runtime access.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <section className="space-y-3" aria-labelledby="acts-as-heading">
                  <h3 id="acts-as-heading" className="flex items-center gap-2 text-sm font-semibold"><UserRoundCheck className="size-4" /> Acts as</h3>
                  <div className="grid items-start gap-5 md:grid-cols-2">
                    <form.Field name="virtualEmployeeId">
                      {(field) => (
                        <div className="space-y-2">
                          <div className="flex min-h-8 items-center justify-between gap-3">
                            <FieldLabel
                              label="Virtual Employee"
                              tip="The business identity this Instance represents. It supplies the Project permission boundary."
                            />
                            <Link to="/$projectId/setting" params={{ projectId }} search={{ section: "virtual-employees" }} className="text-xs font-medium underline underline-offset-4">Manage employees</Link>
                          </div>
                          <Select value={field.state.value} disabled={virtualEmployees.isPending || Boolean(virtualEmployees.error)} onValueChange={field.handleChange}>
                            <SelectTrigger className="h-auto min-h-14 w-full" aria-label="Virtual Employee">
                              <SelectValue placeholder={virtualEmployees.isPending ? "Loading identities…" : "Select an identity"} />
                            </SelectTrigger>
                            <SelectContent>{activeVirtualEmployees.map((employee) => <SelectItem key={employee.id} value={employee.id}>{employee.displayName}</SelectItem>)}</SelectContent>
                          </Select>
                          {virtualEmployees.error ? <p role="alert" className="text-xs text-destructive">{virtualEmployees.error.message}</p> : !virtualEmployees.isPending && !activeVirtualEmployees.length ? <p role="alert" className="border-l-2 border-amber-500 bg-amber-500/5 px-3 py-2 text-xs"><Link to="/$projectId/setting" params={{ projectId }} search={{ section: "virtual-employees" }} className="font-semibold underline underline-offset-4">Create and activate a Virtual Employee</Link> to continue.</p> : null}
                        </div>
                      )}
                    </form.Field>
                    <form.Subscribe selector={(state) => state.values.virtualEmployeeId}>
                      {(virtualEmployeeId) => {
                        const selected = activeVirtualEmployees.find((item) => item.id === virtualEmployeeId);
                        const bindings = (accessPolicies.data ?? []).filter((policy) => policy.virtualEmployeeIds.includes(String(virtualEmployeeId)));
                        return (
                          <div className="space-y-2">
                            <div className="flex min-h-8 items-center">
                              <FieldLabel
                                label="Access Policies"
                                tip="Policies inherited from the selected Virtual Employee. They define which Project resources this Instance may use."
                              />
                            </div>
                            <div
                              aria-live="polite"
                              className={`flex min-h-14 flex-wrap items-center gap-x-2 gap-y-1 rounded-md border bg-muted/20 px-3 py-2 text-sm ${selected && !bindings.length ? "border-amber-500/40 text-amber-700 dark:text-amber-300" : ""}`}
                            >
                              {!selected ? <strong>Choose an identity first</strong> : !bindings.length ? <strong>No policy assigned</strong> : bindings.map((policy) => (
                                <Link
                                  key={policy.id}
                                  to="/$projectId/access-policies/$policyId"
                                  params={{ projectId, policyId: policy.id }}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex min-h-8 items-center gap-1 rounded-sm font-semibold text-foreground underline decoration-muted-foreground/50 underline-offset-4 transition-colors hover:text-primary hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                                >
                                  {policy.name}
                                  <ExternalLink className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                                  <span className="sr-only"> Opens in a new tab</span>
                                </Link>
                              ))}
                            </div>
                          </div>
                        );
                      }}
                    </form.Subscribe>
                  </div>
                </section>

                <Separator />

                <section className="space-y-3" aria-labelledby="works-on-heading">
                  <h3 id="works-on-heading" className="flex items-center gap-2 text-sm font-semibold"><Bot className="size-4" /> Works on</h3>
                  <div className="grid items-start gap-5 md:grid-cols-2">
                    <form.Field name="agentPlatform">
                      {(field) => (
                        <div className="space-y-2">
                          <div className="flex min-h-8 items-center">
                            <FieldLabel
                              htmlFor="instance-agent"
                              label="Agent workbench"
                              tip="The Agent implementation that performs this work."
                            />
                          </div>
                          <AgentSelect id="instance-agent" value={field.state.value} onValueChange={field.handleChange} />
                        </div>
                      )}
                    </form.Field>
                    <form.Field name="policyId">
                      {(field) => (
                        <div className="space-y-2">
                          <div className="flex min-h-8 items-center justify-between gap-3">
                            <FieldLabel
                              label="Runtime permission"
                              tip="Controls the files, commands, and network resources the Agent can access while it runs."
                            />
                            <Link to="/$projectId/runtime-policies" params={{ projectId }} className="text-xs font-medium underline underline-offset-4">Manage permissions</Link>
                          </div>
                          <Select value={field.state.value} disabled={policies.isPending || Boolean(policies.error)} onValueChange={field.handleChange}>
                            <SelectTrigger aria-label="Runtime permission" className="h-auto min-h-14 w-full">
                              <SelectValue placeholder={policies.isPending ? "Loading permissions…" : "Select a permission"} />
                            </SelectTrigger>
                            <SelectContent>{policies.data?.policies.map((policy) => <SelectItem key={policy.id} value={policy.id}>{policy.name} · {policy.networkAccess}</SelectItem>)}</SelectContent>
                          </Select>
                          {policies.error ? <p role="alert" className="text-xs text-destructive">{policies.error.message}</p> : null}
                        </div>
                      )}
                    </form.Field>
                  </div>
                  <form.Subscribe selector={(state) => [state.values.virtualEmployeeId, state.values.agentPlatform, state.values.policyId]}>{([virtualEmployeeId, agentPlatform, policyId]) => { const employee = activeVirtualEmployees.find((item) => item.id === virtualEmployeeId); return employee && policyId ? <p className="border-l-2 border-primary bg-primary/5 px-3 py-2.5 text-xs leading-5"><strong>{getAgentPlatformPresentation(agentPlatform as AgentPlatformId).name}</strong> acts as <strong>{employee.displayName}</strong> with <strong>{policyName(policyId)}</strong> runtime access.</p> : null;}}</form.Subscribe>
                </section>
              </CardContent>
            </Card>
          ) : null}

          {step === 2 ? (
            <form.Subscribe selector={(state) => state.values}>
              {(values) => (
                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2"><Check className="size-5" /> Review & Approve</CardTitle><CardDescription>Evaluate the complete work definition, permission identity, workbench, and extensions before provisioning.</CardDescription></CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid gap-5 sm:grid-cols-2">
                      <ReviewSection title="Work"><ReviewRow label="Instance name" value={values.name} /><ReviewRow label="Role" value={specialization.roleLabel} /><ReviewRow label="System instructions" value={specialization.id === "custom" || currentSystemPrompt !== specialization.systemPrompt ? "Customized for this Instance" : `Role default · ${specialization.roleLabel}`} /></ReviewSection>
                      <ReviewSection title="Identity & Workbench"><ReviewRow label="Acts as" value={activeVirtualEmployees.find((item) => item.id === values.virtualEmployeeId)?.displayName ?? "Unavailable"} /><ReviewRow label="Works on" value={getAgentPlatformPresentation(values.agentPlatform).name} /><ReviewRow label="Runtime permission" value={policyName(values.policyId)} /></ReviewSection>
                    </div>
                    <Separator />
                    <div className="grid gap-5 lg:grid-cols-3">
                      <ReviewSection title={`Skills (${selectedSkills.length})`}>{selectedSkills.length ? selectedSkills.map((item) => <ReviewPill key={item.id} label={capabilityName(item.id, skills, mcpServers)} source={item.source} />) : <EmptyReview label="No Skills selected" />}</ReviewSection>
                      <ReviewSection title={`MCP Servers (${selectedMcps.length})`}>{selectedMcps.length ? selectedMcps.map((item) => <ReviewPill key={item.id} label={capabilityName(item.id, skills, mcpServers)} source={item.source} />) : <EmptyReview label="No MCP Servers selected" />}</ReviewSection>
                      <ReviewSection title={`Knowledge (${selectedKnowledgeSources.length})`}>{selectedKnowledgeSources.length ? selectedKnowledgeSources.map((item) => <ReviewPill key={item.id} label={knowledgeSources.find((source) => source.id === item.id)?.name ?? item.id} source={item.source} />) : <EmptyReview label="No Knowledge selected" />}</ReviewSection>
                    </div>
                    <ReviewAssessment
                      accessPolicyNames={(accessPolicies.data ?? []).filter((policy) => policy.virtualEmployeeIds.includes(String(values.virtualEmployeeId))).map((policy) => policy.name)}
                      incompleteMcpNames={incompleteMcps.map((item) => item?.name).filter((name): name is string => Boolean(name))}
                    />
                  </CardContent>
                </Card>
              )}
            </form.Subscribe>
          ) : null}

          {mutation.error ? <p role="alert" className="border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{mutation.error.message}</p> : null}
        </form>
      </CreateInstanceLayout>
    </EntitySheet>
      {pendingSpecialization ? <ChangeSpecializationDialog open add={pendingChange.add} keep={pendingChange.keep} remove={pendingChange.remove} fromName={specialization.name} toName={pendingSpecialization.name} onCancel={() => setPendingSpecializationId(null)} onConfirm={() => applySpecialization(pendingSpecialization.id)} /> : null}
    </>
  );
}

function ReviewSection({ children, title }: { children: ReactNode; title: string }) {
  return <section><h3 className="mb-3 text-sm font-semibold">{title}</h3><div className="space-y-2">{children}</div></section>;
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-4 text-xs"><span className="text-muted-foreground">{label}</span><strong className="max-w-[70%] break-words text-right">{value}</strong></div>;
}

function ReviewPill({ label, source }: { label: string; source: SelectedCapability["source"] }) {
  return <span className="mb-1.5 mr-1.5 inline-flex min-h-8 items-center gap-2 rounded-sm border bg-muted/40 px-2.5 text-xs font-medium">{label}<span className="text-[10px] font-normal text-muted-foreground">{source === "specialization" ? "Role default" : "Added"}</span></span>;
}

function EmptyReview({ label }: { label: string }) {
  return <p className="text-xs text-muted-foreground">{label}</p>;
}

function FieldLabel({
  htmlFor,
  label,
  tip,
}: {
  htmlFor?: string;
  label: string;
  tip: string;
}) {
  return (
    <div className="flex items-center gap-0.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`About ${label}`}
            className="relative inline-flex size-8 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors after:absolute after:-inset-1.5 after:content-[''] hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <CircleHelp className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6} className="max-w-72 leading-5">{tip}</TooltipContent>
      </Tooltip>
    </div>
  );
}

function ReviewAssessment({
  accessPolicyNames,
  incompleteMcpNames,
}: {
  accessPolicyNames: readonly string[];
  incompleteMcpNames: readonly string[];
}) {
  const warnings = [
    ...(!accessPolicyNames.length ? ["The selected Virtual Employee has no Access Policy binding."] : []),
    ...(incompleteMcpNames.length ? [`Complete the connection or access request for ${incompleteMcpNames.join(", ")} before relying on those tools.`] : []),
  ];

  return (
    <section aria-labelledby="creation-assessment-heading" className={warnings.length ? "border border-amber-500/30 bg-amber-500/5 p-4" : "border border-emerald-500/30 bg-emerald-500/5 p-4"}>
      <div className="flex items-start gap-3">
        {warnings.length ? <CircleAlert className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-300" /> : <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-700 dark:text-emerald-300" />}
        <div className="min-w-0">
          <h3 id="creation-assessment-heading" className="text-sm font-semibold">{warnings.length ? "Ready with attention required" : "Ready to create"}</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Work definition, permission identity, Agent workbench, and Runtime permission are complete.</p>
          {accessPolicyNames.length ? <p className="mt-2 text-xs leading-5"><span className="text-muted-foreground">Effective Access Policies:</span> <strong>{accessPolicyNames.join(", ")}</strong></p> : null}
          {warnings.length ? <ul className="mt-2 space-y-1 text-xs leading-5">{warnings.map((warning) => <li key={warning}>• {warning}</li>)}</ul> : null}
        </div>
      </div>
    </section>
  );
}
