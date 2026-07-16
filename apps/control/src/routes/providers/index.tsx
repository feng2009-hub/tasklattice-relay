import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { providerPresets, type ModelDeployment, type ProviderAccount } from "@tasklattice/contracts";
import { BarChart3, Boxes, CheckCircle2, CircleX, Plus, RefreshCw, Server } from "lucide-react";
import { ProviderIcon } from "@/components/providers/provider-icon";
import { ProviderRegistrationDrawer } from "@/components/providers/provider-registration-drawer";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";

export const Route = createFileRoute("/providers/")({ component: ProvidersPage });

function ProvidersPage() {
  const [registerOpen, setRegisterOpen] = useState(false);
  const [drawerAccount, setDrawerAccount] = useState<ProviderAccount>();
  const accounts = useQuery({ queryKey: ["provider-accounts"], queryFn: api.listProviderAccounts });
  const models = useQuery({ queryKey: ["model-deployments"], queryFn: api.listModelDeployments });
  const validatedModels = (models.data ?? []).filter((model) => model.status === "VALIDATED");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Provider registry"
        title="Providers"
        description="Register credentials once, validate the connection, then attach multiple categorized models to the same Provider Account."
        actions={<div className="flex gap-2"><Button asChild variant="outline" className="h-11"><Link to="/providers/cost"><BarChart3 />Cost</Link></Button><Button className="h-11" onClick={() => { setDrawerAccount(undefined); setRegisterOpen(true); }}><Plus />Register Provider</Button></div>}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Summary label="Provider Accounts" value={accounts.data?.length ?? 0} />
        <Summary label="Validated models" value={validatedModels.length} />
        <Summary label="Model categories" value={new Set(validatedModels.map((item) => item.modelType)).size} />
      </div>

      {accounts.isLoading || models.isLoading ? (
        <div className="flex min-h-48 items-center justify-center gap-3 border text-sm text-muted-foreground"><Spinner />Loading Provider registry…</div>
      ) : accounts.error || models.error ? (
        <div role="alert" className="border-l-2 border-destructive bg-destructive/5 p-4 text-sm text-destructive">{accounts.error?.message ?? models.error?.message}</div>
      ) : accounts.data?.length ? (
        <div className="space-y-4">
          {accounts.data.map((account) => (
            <ProviderAccountCard
              key={account.id}
              account={account}
              models={(models.data ?? []).filter((model) => model.providerAccountId === account.id)}
              onAddModel={() => { setDrawerAccount(account); setRegisterOpen(true); }}
            />
          ))}
        </div>
      ) : (
        <Card><CardContent><EmptyState icon={Server} title="No Provider Accounts" description="Choose a catalog Provider, validate its Endpoint and key, then register the models this workspace can use." /></CardContent></Card>
      )}

      <ProviderRegistrationDrawer open={registerOpen} onOpenChange={setRegisterOpen} initialAccount={drawerAccount} />
    </div>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return <Card><CardHeader><CardDescription>{label}</CardDescription><CardTitle className="text-3xl">{value}</CardTitle></CardHeader></Card>;
}

function ProviderAccountCard({
  account,
  models,
  onAddModel,
}: {
  account: ProviderAccount;
  models: ModelDeployment[];
  onAddModel: () => void;
}) {
  const queryClient = useQueryClient();
  const preset = providerPresets.find((item) => item.id === account.presetId)!;
  const revalidate = useMutation({
    mutationFn: () => api.revalidateProviderAccount(account.id),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["provider-accounts"] }),
  });
  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <ProviderIcon presetId={account.presetId} />
            <div><CardTitle>{account.name}</CardTitle><CardDescription className="mt-1">{preset.name} · <span className="font-mono">{account.endpoint}</span></CardDescription></div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={account.status === "VALIDATED" ? "secondary" : "destructive"}>{account.status === "VALIDATED" ? <CheckCircle2 /> : <CircleX />}{account.status}</Badge>
            <Button size="sm" onClick={onAddModel} disabled={account.status !== "VALIDATED"}><Plus />Add model</Button>
            <Button size="sm" variant="outline" onClick={() => revalidate.mutate()} disabled={revalidate.isPending}>{revalidate.isPending ? <Spinner /> : <RefreshCw />}Revalidate</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="border-l-2 border-border px-3 text-xs leading-5 text-muted-foreground">{account.validationMessage}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {account.checks.map((check) => <div key={check.id} className="flex min-h-10 items-center justify-between border px-3 text-xs"><span>{check.label}</span><strong className={check.status === "FAIL" ? "text-destructive" : "text-emerald-600"}>{check.status}</strong></div>)}
        </div>
        <section aria-label={`${account.name} models`}>
          <div className="mb-2 flex items-center justify-between"><h3 className="flex items-center gap-2 text-sm font-semibold"><Boxes className="size-4" />Models</h3><Badge variant="outline">{models.length}</Badge></div>
          {models.length ? <div className="divide-y border">{models.map((model) => <ModelRow key={model.id} model={model} />)}</div> : <p className="border bg-muted/20 p-4 text-xs text-muted-foreground">No models registered yet. Add a categorized model using this validated account.</p>}
        </section>
      </CardContent>
    </Card>
  );
}

function ModelRow({ model }: { model: ModelDeployment }) {
  const price = model.modelType === "speech-to-text"
    ? `$${(model.feePerAudioMinute ?? 0).toFixed(4)} / audio min`
    : `$${(model.inputFeePerMillionTokens ?? 0).toFixed(2)} input${model.modelType === "llm" ? ` · $${(model.outputFeePerMillionTokens ?? 0).toFixed(2)} output` : ""} / 1M`;
  return (
    <div className="grid min-h-16 gap-2 px-3 py-3 text-xs sm:grid-cols-[minmax(0,1fr)_9rem_13rem_auto] sm:items-center">
      <div><strong className="block text-sm">{model.displayName}</strong><span className="font-mono text-muted-foreground">{model.modelId}</span></div>
      <Badge variant="outline" className="w-fit">{model.modelType}</Badge>
      <span className="text-muted-foreground">{price}</span>
      <Badge variant={model.status === "VALIDATED" ? "secondary" : "destructive"}>{model.status}</Badge>
    </div>
  );
}
