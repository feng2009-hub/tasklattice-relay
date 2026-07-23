import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  modelTypes,
  providerConnectionDraftSchema,
  providerPresets,
  type ModelType,
  type ComplianceDomain,
  type ProviderAccount,
  type ProviderConnectionDraft,
  type ProviderDiscoveryResult,
  type ProviderKind,
  type ProviderModelSelection,
} from "@tasklattice/contracts";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Plus, X } from "lucide-react";
import { ProviderPicker } from "./provider-picker";
import { createProviderDraft, providerUiRegistry } from "./provider-ui-registry";
import type { ProviderConfigurator } from "./configurators/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const modelTypeLabels: Record<ModelType, string> = {
  llm: "Language model",
  "text-embedding": "Embedding",
  "speech-to-text": "Speech to text",
};

type Step = "configure" | "models" | "summary";

export function ProviderRegistrationDrawer({
  open,
  onOpenChange,
  initialAccount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialAccount?: ProviderAccount | undefined;
}) {
  const queryClient = useQueryClient();
  const providerTriggerRef = useRef<HTMLButtonElement>(null);
  const [step, setStep] = useState<Step>("configure");
  const [draft, setDraft] = useState<ProviderConnectionDraft>(() => createProviderDraft("openai"));
  const [providerSelected, setProviderSelected] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [discovery, setDiscovery] = useState<ProviderDiscoveryResult>();
  const [models, setModels] = useState<ProviderModelSelection[]>([]);
  const [manualModelId, setManualModelId] = useState("");
  const [manualModelType, setManualModelType] = useState<ModelType>("llm");
  const [complianceDomain, setComplianceDomain] = useState<ComplianceDomain>("GLOBAL");

  const discover = useMutation({
    mutationFn: api.discoverProviderModels,
    onSuccess: (result) => {
      setDiscovery(result);
      setModels(result.models[0] ? [{ ...result.models[0] }] : []);
      setStep("models");
    },
  });
  const create = useMutation({
    mutationFn: api.registerProviderAccount,
    onSuccess: async () => {
      setStep("summary");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["provider-accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["model-deployments"] }),
        queryClient.invalidateQueries({ queryKey: ["provider-cost"] }),
      ]);
    },
  });
  const retryFailures = useMutation({
    mutationFn: async () => {
      if (!create.data) return [];
      return Promise.all(create.data.failures.map(({ model }) => api.registerModelDeployment({
        providerAccountId: create.data!.account.id,
        ...model,
      })));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["model-deployments"] });
    },
  });

  useEffect(() => {
    if (!open || initialAccount) return;
    setStep("configure");
    setDraft(createProviderDraft("openai"));
    setProviderSelected(false);
    setErrors({});
    setDiscovery(undefined);
    setModels([]);
    setManualModelId("");
    setComplianceDomain("GLOBAL");
    discover.reset();
    create.reset();
    retryFailures.reset();
  }, [initialAccount, open]);

  useEffect(() => {
    if (!open || initialAccount) return;
    const timer = window.setTimeout(() => providerTriggerRef.current?.focus(), 100);
    return () => window.clearTimeout(timer);
  }, [initialAccount, open]);

  const pending = discover.isPending || create.isPending || retryFailures.isPending;
  const close = (next: boolean) => {
    if (!next && pending) return;
    onOpenChange(next);
  };

  if (initialAccount)
    return (
      <Drawer open={open} onOpenChange={close} direction="right">
        <DrawerContent className="!w-full sm:!w-[min(100vw,40rem)]">
          <DrawerHeader className="relative border-b pr-16">
            <DrawerTitle className="font-serif text-xl sm:text-2xl">Add a model</DrawerTitle>
            <DrawerDescription>Register another model through {initialAccount.name} without storing another credential.</DrawerDescription>
            <DrawerClose asChild><Button aria-label="Close drawer" variant="ghost" size="icon" className="absolute right-4 top-4"><X /></Button></DrawerClose>
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-5"><ExistingAccountModelForm account={initialAccount} onCreated={() => onOpenChange(false)} /></div>
        </DrawerContent>
      </Drawer>
    );

  const definition = providerUiRegistry[draft.provider];
  const Configurator = definition.Component as ProviderConfigurator;

  const selectProvider = (kind: ProviderKind) => {
    setDraft(createProviderDraft(kind));
    setProviderSelected(true);
    setDiscovery(undefined);
    setModels([]);
    setErrors({});
    discover.reset();
    create.reset();
  };

  const validateAndDiscover = () => {
    if (!providerSelected) return;
    const parsed = providerConnectionDraftSchema.safeParse(draft);
    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues)
        nextErrors[String(issue.path.at(-1) ?? "form")] = issue.message;
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    discover.mutate(parsed.data);
  };

  return (
    <Drawer open={open} onOpenChange={close} direction="right">
      <DrawerContent className="!w-full sm:!w-[min(100vw,40rem)]">
        <DrawerHeader className="relative border-b pr-16">
          <DrawerTitle className="font-serif text-xl sm:text-2xl">Add upstream connection</DrawerTitle>
          <DrawerDescription>Connect a Provider and register models for the Model Profile upstream pool.</DrawerDescription>
          <DrawerClose asChild><Button aria-label="Close drawer" variant="ghost" size="icon" className="absolute right-4 top-4" disabled={pending}><X /></Button></DrawerClose>
        </DrawerHeader>

        <WizardSteps step={step} />

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {step === "configure" ? (
            <div className="space-y-6">
              <div className="space-y-3">
                <Label htmlFor="provider-picker">Provider</Label>
                <ProviderPicker
                  ref={providerTriggerRef}
                  disabled={pending}
                  value={providerSelected ? draft.provider : undefined}
                  onChange={selectProvider}
                />
              </div>
              {providerSelected ? <div className="space-y-5 border-t pt-5">
                <div className="space-y-2"><Label htmlFor="provider-connection-name">Connection name</Label><Input id="provider-connection-name" value={draft.name} disabled={pending} aria-invalid={Boolean(errors.name)} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />{errors.name ? <p className="text-xs text-destructive">{errors.name}</p> : null}</div>
                <div className="space-y-2"><Label>Compliance domain</Label><Select value={complianceDomain} onValueChange={(value) => setComplianceDomain(value as ComplianceDomain)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="CN_MAINLAND">CN Mainland</SelectItem><SelectItem value="GLOBAL">Global</SelectItem></SelectContent></Select><p className="text-xs leading-5 text-muted-foreground">Written to LiteLLM model metadata and enforced fail-closed by Model Profiles.</p></div>
                <Configurator value={draft} onChange={setDraft} errors={errors} disabled={pending} />
              </div> : null}
              {discover.error ? <p role="alert" className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">{discover.error.message}</p> : null}
            </div>
          ) : step === "models" && discovery ? (
            <ModelDiscoveryStep discovery={discovery} models={models} setModels={setModels} manualModelId={manualModelId} setManualModelId={setManualModelId} manualModelType={manualModelType} setManualModelType={setManualModelType} supportedTypes={providerPresets.find((provider) => provider.id === draft.provider)!.modelTypes as readonly ModelType[]} />
          ) : step === "summary" && create.data ? (
            <SummaryStep result={create.data} retryPending={retryFailures.isPending} retryComplete={Boolean(retryFailures.data)} onRetry={() => retryFailures.mutate()} />
          ) : null}
          {create.error ? <p role="alert" className="mt-4 border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">{create.error.message}</p> : null}
        </div>

        <DrawerFooter>
          {step === "configure" ? <div className="flex items-center justify-between"><DrawerClose asChild><Button variant="outline" disabled={pending}>Cancel</Button></DrawerClose><Button onClick={validateAndDiscover} disabled={!providerSelected || pending}>{discover.isPending ? <Spinner /> : null}Next: Discover models<ArrowRight /></Button></div> : step === "models" ? <div className="flex items-center justify-between"><Button variant="outline" onClick={() => setStep("configure")} disabled={pending}><ArrowLeft />Back</Button><Button disabled={!models.length || pending} onClick={() => create.mutate({ connection: draft, models, complianceDomain })}>{create.isPending ? <Spinner /> : null}Register {models.length || ""} model{models.length === 1 ? "" : "s"}<ArrowRight /></Button></div> : <div className="flex justify-end"><DrawerClose asChild><Button>Done</Button></DrawerClose></div>}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function WizardSteps({ step }: { step: Step }) {
  const active = step === "configure" ? 0 : step === "models" ? 1 : 2;
  return <ol className="grid grid-cols-3 border-b px-5 py-4 text-xs">{["Configure", "Discover models", "Summary"].map((label, index) => <li key={label} className={cn("flex items-center gap-2 text-muted-foreground", index <= active && "text-foreground")}><span className={cn("grid size-7 place-items-center rounded-full border font-mono", index <= active && "border-primary bg-primary text-primary-foreground")}>{index < active ? <Check className="size-4" /> : index + 1}</span><strong className="hidden sm:inline">{label}</strong>{index < 2 ? <span className="ml-auto h-px flex-1 bg-border" /> : null}</li>)}</ol>;
}

function ModelDiscoveryStep({ discovery, manualModelId, manualModelType, models, setManualModelId, setManualModelType, setModels, supportedTypes }: {
  discovery: ProviderDiscoveryResult;
  manualModelId: string;
  manualModelType: ModelType;
  models: ProviderModelSelection[];
  setManualModelId: (value: string) => void;
  setManualModelType: (value: ModelType) => void;
  setModels: (models: ProviderModelSelection[]) => void;
  supportedTypes: readonly ModelType[];
}) {
  const selected = new Set(models.map((model) => model.modelId));
  const toggle = (model: ProviderModelSelection) => setModels(selected.has(model.modelId) ? models.filter((item) => item.modelId !== model.modelId) : [...models, model]);
  return <div className="space-y-6"><div className={cn("border-l-2 px-4 py-3 text-sm", discovery.checks.some((check) => check.status === "FAIL") ? "border-amber-500 bg-amber-500/5" : "border-emerald-500 bg-emerald-500/5")}><strong>{discovery.mode === "remote" ? "Live model catalog" : discovery.mode === "suggested" ? "Recommended models" : "Manual model registration"}</strong><p className="mt-1 text-xs leading-5 text-muted-foreground">{discovery.message}</p></div><div className="grid gap-2 sm:grid-cols-3">{discovery.checks.map((check) => <div key={check.id} className="flex min-h-11 items-center justify-between border px-3 text-xs"><span>{check.label}</span><strong className={cn(check.status === "PASS" && "text-emerald-600", check.status === "FAIL" && "text-destructive", check.status === "SKIP" && "text-muted-foreground")}>{check.status}</strong></div>)}</div>{discovery.models.length ? <section><div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">Available models</h3><Badge variant="outline">{models.length} selected</Badge></div><div className="max-h-72 divide-y overflow-y-auto border">{discovery.models.map((model) => <button key={model.modelId} type="button" aria-pressed={selected.has(model.modelId)} onClick={() => toggle({ ...model })} className={cn("flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/40", selected.has(model.modelId) && "bg-primary/5")}><span className={cn("grid size-5 place-items-center border", selected.has(model.modelId) && "border-primary bg-primary text-primary-foreground")}>{selected.has(model.modelId) ? <Check className="size-3.5" /> : null}</span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{model.displayName}</strong><span className="block truncate font-mono text-xs text-muted-foreground">{model.modelId}</span></span><Badge variant="outline">{model.modelType}</Badge></button>)}</div></section> : null}<section className="space-y-3 border bg-muted/10 p-4"><h3 className="text-sm font-semibold">Add a model ID manually</h3><div className="grid gap-3 sm:grid-cols-[1fr_11rem_auto]"><Input aria-label="Manual model ID" placeholder="Model or deployment ID" value={manualModelId} onChange={(event) => setManualModelId(event.target.value)} /><Select value={manualModelType} onValueChange={(value) => setManualModelType(value as ModelType)}><SelectTrigger aria-label="Manual model type"><SelectValue /></SelectTrigger><SelectContent>{modelTypes.filter((type) => supportedTypes.includes(type)).map((type) => <SelectItem key={type} value={type}>{modelTypeLabels[type]}</SelectItem>)}</SelectContent></Select><Button type="button" variant="outline" disabled={!manualModelId.trim() || selected.has(manualModelId.trim())} onClick={() => { const id = manualModelId.trim(); setModels([...models, { modelId: id, displayName: id, modelType: manualModelType }]); setManualModelId(""); }}><Plus />Add</Button></div></section></div>;
}

function SummaryStep({ onRetry, result, retryComplete, retryPending }: { onRetry: () => void; result: NonNullable<ReturnType<typeof api.registerProviderAccount> extends Promise<infer T> ? T : never>; retryComplete: boolean; retryPending: boolean }) {
  return <div className="space-y-6"><div className="flex items-start gap-3 border bg-emerald-500/5 p-4"><CheckCircle2 className="mt-0.5 size-5 text-emerald-600" /><div><strong>{result.account.name} is connected</strong><p className="mt-1 text-xs text-muted-foreground">{result.account.validationMessage}</p></div></div><section><h3 className="mb-2 text-sm font-semibold">Registered models</h3><div className="divide-y border">{result.models.map((model) => <div key={model.id} className="flex min-h-14 items-center justify-between gap-3 px-3 py-2"><span><strong className="block text-sm">{model.displayName}</strong><span className="font-mono text-xs text-muted-foreground">{model.modelId}</span></span><Badge variant="secondary">Healthy</Badge></div>)}</div></section>{result.failures.length ? <section><div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">Needs attention</h3><Button size="sm" variant="outline" disabled={retryPending || retryComplete} onClick={onRetry}>{retryPending ? <Spinner /> : null}{retryComplete ? "Retry complete" : "Retry failed models"}</Button></div><div className="divide-y border border-amber-500/40">{result.failures.map(({ message, model }) => <div key={model.modelId} className="px-3 py-3"><strong className="text-sm">{model.displayName}</strong><p className="mt-1 text-xs text-muted-foreground">{message}</p></div>)}</div></section> : null}</div>;
}

function ExistingAccountModelForm({ account, onCreated }: { account: ProviderAccount; onCreated: () => void }) {
  const queryClient = useQueryClient();
  const preset = providerPresets.find((item) => item.id === account.providerKind)!;
  const supportedTypes = preset.modelTypes as readonly ModelType[];
  const [modelId, setModelId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [modelType, setModelType] = useState<ModelType>(supportedTypes[0] ?? "llm");
  const add = useMutation({ mutationFn: api.registerModelDeployment, onSuccess: async (model) => { await queryClient.invalidateQueries({ queryKey: ["model-deployments"] }); if (model.status === "VALIDATED") onCreated(); } });
  return <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); add.mutate({ providerAccountId: account.id, modelId, displayName: displayName || modelId, modelType }); }}><div className="space-y-2"><Label htmlFor="existing-model-id">Model or deployment ID</Label><Input id="existing-model-id" value={modelId} required onChange={(event) => { setModelId(event.target.value); if (!displayName) setDisplayName(event.target.value); }} /></div><div className="space-y-2"><Label htmlFor="existing-model-name">Display name</Label><Input id="existing-model-name" value={displayName} required onChange={(event) => setDisplayName(event.target.value)} /></div><div className="space-y-2"><Label>Model type</Label><Select value={modelType} onValueChange={(value) => setModelType(value as ModelType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{supportedTypes.map((type) => <SelectItem key={type} value={type}>{modelTypeLabels[type]}</SelectItem>)}</SelectContent></Select></div>{add.data?.status === "FAILED" ? <p role="alert" className="text-sm text-destructive">{add.data.validationMessage}</p> : null}{add.error ? <p role="alert" className="text-sm text-destructive">{add.error.message}</p> : null}<Button type="submit" disabled={add.isPending}>{add.isPending ? <Spinner /> : <Plus />}Validate and add model</Button></form>;
}
