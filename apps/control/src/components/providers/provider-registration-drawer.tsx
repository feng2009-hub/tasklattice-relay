import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  modelTypes,
  providerPresets,
  type ModelType,
  type ModelDeployment,
  type ProviderAccount,
  type ProviderPresetId,
} from "@tasklattice/contracts";
import { CheckCircle2, KeyRound, Plus, ServerCog, ShieldCheck } from "lucide-react";
import { ProviderIcon } from "./provider-icon";
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
  const [presetId, setPresetId] = useState<ProviderPresetId>("deepseek");
  const preset = providerPresets.find((item) => item.id === presetId)!;
  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState(preset.endpoint ?? "");
  const [apiKey, setApiKey] = useState("");
  const [account, setAccount] = useState<ProviderAccount>();

  useEffect(() => {
    if (!open) return;
    setAccount(initialAccount);
    registerAccount.reset();
  }, [initialAccount, open]);

  useEffect(() => {
    setEndpoint(preset.endpoint ?? "");
    setName(`${preset.name} production`);
  }, [preset]);

  const registerAccount = useMutation({
    mutationFn: api.registerProviderAccount,
    onSuccess: async (created) => {
      setAccount(created);
      setApiKey("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["provider-accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["model-deployments"] }),
      ]);
    },
  });

  const close = (next: boolean) => {
    if (!next && !registerAccount.isPending) {
      setAccount(undefined);
      registerAccount.reset();
    }
    onOpenChange(next);
  };

  return (
    <Drawer open={open} onOpenChange={close} direction="right">
      <DrawerContent className="w-[min(96vw,46rem)]">
        <DrawerHeader className="border-b">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Provider registry</p>
          <DrawerTitle className="font-serif text-2xl">{initialAccount ? `Add models to ${initialAccount.name}` : "Register a Provider Account"}</DrawerTitle>
          <DrawerDescription>
            {initialAccount
              ? "Reuse this validated Endpoint and credential while keeping model type and pricing explicit."
              : "Choose a managed Provider and enter its key. TaskLattice validates the credential and configures the models exposed to it."}
          </DrawerDescription>
        </DrawerHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="mb-6 grid grid-cols-3 border text-xs">
            {["Choose provider", "Validate & configure", "Ready"].map((label, index) => (
              <div key={label} className={cn("min-h-14 border-r p-3 last:border-r-0", (account ? 2 : registerAccount.isPending ? 1 : 0) === index && "bg-primary/5 text-foreground")}>
                <span className="font-mono text-muted-foreground">0{index + 1}</span>
                <strong className="ml-2">{label}</strong>
              </div>
            ))}
          </div>

          {!account ? (
            <form
              className="space-y-6"
              onSubmit={(event) => {
                event.preventDefault();
                registerAccount.mutate({ name, presetId, endpoint, apiKey });
              }}
            >
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold">Provider catalog</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {providerPresets.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={item.id === presetId}
                      onClick={() => { setPresetId(item.id); setName(`${item.name} production`); }}
                      className={cn("flex min-h-24 items-start gap-3 border p-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-2", item.id === presetId && "border-primary bg-primary/5 shadow-[inset_3px_0_0_var(--primary)]")}
                    >
                      <ProviderIcon presetId={item.id} />
                      <span>
                        <strong className="block text-sm">{item.name}</strong>
                        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{item.description}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </fieldset>

              {preset.endpoint ? (
                <div className="space-y-3 border bg-muted/20 p-4">
                  <div className="flex items-start gap-3">
                    <ServerCog className="mt-0.5 size-5 text-primary" />
                    <div>
                      <strong className="text-sm">Managed Provider configuration</strong>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">{preset.endpoint}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {preset.defaultModels.map((model) => <Badge key={model.modelId} variant="outline">{model.displayName}</Badge>)}
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">Account name, Endpoint, model category, and known pricing are supplied by the Provider catalog. Only models returned for this key are configured.</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="provider-account-name">Account name</Label>
                    <Input id="provider-account-name" value={name} onChange={(event) => setName(event.target.value)} required minLength={3} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="provider-account-endpoint">Endpoint</Label>
                    <Input id="provider-account-endpoint" type="url" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} required />
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="provider-account-key">API key</Label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-3.5 size-4 text-muted-foreground" />
                  <Input id="provider-account-key" className="pl-10" type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} required minLength={8} placeholder="Write-only credential" />
                </div>
                <p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-3.5" />The key is never returned by the API.</p>
              </div>
              {registerAccount.error ? <p role="alert" className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">{registerAccount.error.message}</p> : null}
              <Button type="submit" className="h-11" disabled={registerAccount.isPending}>
                {registerAccount.isPending ? <Spinner /> : <ShieldCheck />}
                {registerAccount.isPending ? "Validating and configuring models…" : "Validate key & configure"}
              </Button>
            </form>
          ) : !initialAccount && account.presetId !== "custom-openai-compatible" ? (
            <ProviderReady account={account} />
          ) : (
            <ModelRegistration account={account} />
          )}
        </div>
        <DrawerFooter>
          <DrawerClose asChild><Button variant="outline">{account ? "Done" : "Cancel"}</Button></DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function ProviderReady({ account }: { account: ProviderAccount }) {
  const models = useQuery({
    queryKey: ["model-deployments"],
    queryFn: api.listModelDeployments,
  });
  const configuredModels = (models.data ?? []).filter(
    (model) => model.providerAccountId === account.id,
  );
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 border bg-emerald-500/5 p-4">
        <CheckCircle2 className="mt-0.5 size-5 text-emerald-600" />
        <div>
          <strong className="text-sm">{account.name} is ready</strong>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{account.validationMessage}</p>
        </div>
      </div>
      <div className="divide-y border">
        {configuredModels.map((model: ModelDeployment) => (
          <div key={model.id} className="flex min-h-14 items-center justify-between gap-3 px-3 py-2 text-xs">
            <span><strong className="block text-sm">{model.displayName}</strong><span className="font-mono text-muted-foreground">{model.modelId}</span></span>
            <Badge variant={model.status === "VALIDATED" ? "secondary" : "destructive"}>{model.status}</Badge>
          </div>
        ))}
      </div>
      <p className="text-xs leading-5 text-muted-foreground">You can use every validated model when creating an Instance. Revalidate the account later to reconcile catalog changes.</p>
    </div>
  );
}

function ModelRegistration({ account }: { account: ProviderAccount }) {
  const queryClient = useQueryClient();
  const preset = providerPresets.find((item) => item.id === account.presetId)!;
  const supportedTypes = preset.modelTypes as readonly ModelType[];
  const [modelType, setModelType] = useState<ModelType>(supportedTypes[0] ?? "llm");
  const suggestions = useMemo(
    () => [...new Set([
      ...account.discoveredModels,
      ...preset.defaultModels.map((model) => model.modelId),
    ])],
    [account.discoveredModels, preset.defaultModels],
  );
  const [modelId, setModelId] = useState(suggestions[0] ?? "");
  const [displayName, setDisplayName] = useState(suggestions[0] ?? "");
  const [inputFee, setInputFee] = useState(0);
  const [outputFee, setOutputFee] = useState(0);
  const [audioFee, setAudioFee] = useState(0);
  const addModel = useMutation({
    mutationFn: api.registerModelDeployment,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["model-deployments"] });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 border bg-emerald-500/5 p-4">
        <CheckCircle2 className="mt-0.5 size-5 text-emerald-600" />
        <div><strong className="text-sm">{account.name} is validated</strong><p className="mt-1 text-xs text-muted-foreground">{account.validationMessage}</p></div>
      </div>
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          addModel.mutate({
            providerAccountId: account.id,
            modelId,
            displayName,
            modelType,
            ...(modelType === "speech-to-text" ? { feePerAudioMinute: audioFee } : { inputFeePerMillionTokens: inputFee, ...(modelType === "llm" ? { outputFeePerMillionTokens: outputFee } : {}) }),
          });
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label>Model type</Label><Select value={modelType} onValueChange={(value) => setModelType(value as ModelType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{modelTypes.filter((type) => supportedTypes.includes(type)).map((type) => <SelectItem key={type} value={type}>{modelTypeLabels[type]}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label htmlFor="provider-model-id">Model ID</Label><Input id="provider-model-id" list="provider-model-suggestions" value={modelId} onChange={(event) => { setModelId(event.target.value); setDisplayName(event.target.value); }} required /><datalist id="provider-model-suggestions">{suggestions.map((item) => <option key={item} value={item} />)}</datalist></div>
        </div>
        <div className="space-y-2"><Label htmlFor="provider-model-display-name">Display name</Label><Input id="provider-model-display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required /></div>
        {modelType === "speech-to-text" ? (
          <div className="space-y-2"><Label htmlFor="provider-audio-fee">USD per audio minute</Label><Input id="provider-audio-fee" type="number" min="0" step="0.0001" value={audioFee} onChange={(event) => setAudioFee(event.target.valueAsNumber || 0)} /></div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="provider-input-fee">Input USD / 1M tokens</Label><Input id="provider-input-fee" type="number" min="0" step="0.01" value={inputFee} onChange={(event) => setInputFee(event.target.valueAsNumber || 0)} /></div>
            {modelType === "llm" ? <div className="space-y-2"><Label htmlFor="provider-output-fee">Output USD / 1M tokens</Label><Input id="provider-output-fee" type="number" min="0" step="0.01" value={outputFee} onChange={(event) => setOutputFee(event.target.valueAsNumber || 0)} /></div> : null}
          </div>
        )}
        {addModel.data ? <p role="status" className={cn("border-l-2 px-3 py-2 text-xs", addModel.data.status === "VALIDATED" ? "border-emerald-500 bg-emerald-500/5" : "border-destructive bg-destructive/5 text-destructive")}>{addModel.data.validationMessage}</p> : null}
        {addModel.error ? <p role="alert" className="text-sm text-destructive">{addModel.error.message}</p> : null}
        <Button type="submit" disabled={addModel.isPending}><Plus />{addModel.isPending ? "Validating and registering…" : "Add model"}</Button>
      </form>
      <div className="flex flex-wrap gap-2">{supportedTypes.map((type) => <Badge key={type} variant="outline">{modelTypeLabels[type]}</Badge>)}</div>
    </div>
  );
}
