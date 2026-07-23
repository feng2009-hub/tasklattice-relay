import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  providerPresets,
  type ModelProfileCapabilityState,
  type ModelProfile,
  type ModelProfileStatus,
  type ModelDeployment,
  type ProviderAccount,
  type ProviderResourceStatus,
} from "@tasklattice/contracts";
import {
  Activity,
  ArrowRight,
  Boxes,
  Cable,
  Check,
  CheckCircle2,
  CircleAlert,
  Database,
  Ellipsis,
  KeyRound,
  Plus,
  RefreshCw,
  Route as RouteIcon,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ProviderIcon } from "@/components/providers/provider-icon";
import { ProviderRegistrationDrawer } from "@/components/providers/provider-registration-drawer";
import { EntityFormSheet } from "@/components/shared/entity-form-sheet";
import { MetricCard } from "@/components/shared/metric-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/providers/model-profiles/")({ component: ModelProfilesPage });

type ProfileFilter = "all" | "ready" | "attention";

function ModelProfilesPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [drawerAccount, setDrawerAccount] = useState<ProviderAccount>();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ProfileFilter>("all");
  const queryClient = useQueryClient();
  const profileQuery = useQuery({ queryKey: ["model-profiles"], queryFn: api.listModelProfiles });
  const accounts = useQuery({ queryKey: ["provider-accounts"], queryFn: api.listProviderAccounts });
  const models = useQuery({ queryKey: ["model-deployments"], queryFn: api.listModelDeployments });
  const refresh = useMutation({
    mutationFn: api.refreshModelProfile,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["model-profiles"] }),
  });
  const profiles = profileQuery.data ?? [];
  const providerAccounts = accounts.data ?? [];
  const deployments = models.data ?? [];
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return profiles.filter((profile) => {
      const matchesFilter = filter === "all"
        || (filter === "ready" && profile.status === "READY")
        || (filter === "attention" && profile.status !== "READY");
      return matchesFilter && (!normalized || `${profile.name} ${profile.description} ${profile.publicModelAlias}`.toLowerCase().includes(normalized));
    });
  }, [filter, profiles, query]);
  const openConnection = (account?: ProviderAccount) => {
    setDrawerAccount(account);
    setConnectionOpen(true);
  };

  return (
    <div className="space-y-7">
      <PageHeader
        title="Model Profiles"
        description="Package upstream models, routing behavior, compliance, and access policy into one reusable model choice."
        actions={<div className="flex flex-wrap gap-2"><Button variant="outline" className="h-11" onClick={() => openConnection()}><Cable />Add upstream</Button><Button className="h-11" onClick={() => setCreateOpen(true)}><Plus />Create model profile</Button></div>}
      />

      <section className="grid overflow-hidden border lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,.7fr)]">
        <div className="p-5 sm:p-6">
          <div className="flex gap-3">
            <span className="grid size-11 shrink-0 place-items-center bg-primary text-primary-foreground"><SlidersHorizontal className="size-5" /></span>
            <div>
              <h2 className="text-lg font-medium">One choice for the whole inference path</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">Instances select a Model Profile—not a provider credential or router alias. The profile keeps the public model identity stable while upstreams and routing can evolve behind it.</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 border-t bg-muted/20 lg:border-l lg:border-t-0">
          <Layer icon={Database} label="Upstream" value={`${deployments.filter((model) => model.status === "VALIDATED").length} models`} />
          <Layer icon={RouteIcon} label="Routing" value="LiteLLM" />
          <Layer icon={KeyRound} label="Access" value="Per Instance" />
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <MetricCard icon={SlidersHorizontal} label="Model profiles" value={profiles.length} />
        <MetricCard icon={CheckCircle2} label="Ready to use" value={profiles.filter((profile) => profile.status === "READY").length} />
        <MetricCard icon={Boxes} label="Active consumers" value={profiles.reduce((sum, profile) => sum + profile.consumers, 0)} />
        <MetricCard icon={Cable} label="Healthy upstreams" value={`${providerAccounts.filter((account) => account.status === "VALIDATED").length}/${providerAccounts.length}`} />
      </div>

      <section aria-labelledby="profile-list-title" className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div><h2 id="profile-list-title" className="text-lg font-medium">Profiles</h2><p className="mt-1 text-sm text-muted-foreground">The model choices exposed to Agent and Instance workflows.</p></div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative sm:w-72"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" aria-label="Search model profiles" placeholder="Search name or model alias…" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
            <Select value={filter} onValueChange={(value) => setFilter(value as ProfileFilter)}><SelectTrigger className="w-full sm:w-40" aria-label="Filter model profiles"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All profiles</SelectItem><SelectItem value="ready">Ready</SelectItem><SelectItem value="attention">Needs attention</SelectItem></SelectContent></Select>
          </div>
        </div>

        {profileQuery.isPending ? <LoadingState label="Loading Model Profiles…" />
          : profileQuery.error ? <ErrorState message={profileQuery.error.message} />
          : profiles.length ? (
            <Card className="overflow-hidden"><CardContent className="p-0">
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="border-b bg-muted/30 text-xs text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Profile</th><th className="px-4 py-3 font-medium">Public model</th><th className="px-4 py-3 font-medium">Routing</th><th className="px-4 py-3 font-medium">Guardrails</th><th className="px-4 py-3 font-medium">Consumers</th><th className="px-4 py-3 font-medium">Readiness</th><th className="w-28"><span className="sr-only">Actions</span></th></tr></thead>
                  <tbody className="divide-y">{filtered.map((profile) => <ProfileRow key={profile.id} profile={profile} refreshing={refresh.isPending && refresh.variables === profile.id} onRefresh={() => refresh.mutate(profile.id)} />)}</tbody>
                </table>
              </div>
              <div className="divide-y md:hidden">{filtered.map((profile) => <ProfileMobileCard key={profile.id} profile={profile} />)}</div>
              {!filtered.length ? <div className="p-10 text-center text-sm text-muted-foreground">No Model Profiles match the current filters.</div> : null}
            </CardContent></Card>
          ) : (
            <Card><CardContent className="flex min-h-64 flex-col items-center justify-center text-center"><SlidersHorizontal className="size-8 text-muted-foreground" /><h2 className="mt-4 text-base font-semibold">Create your first Model Profile</h2><p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">Start with an upstream connection, then choose a validated model and the access policy Instances should receive.</p><div className="mt-5 flex flex-wrap justify-center gap-2"><Button variant="outline" onClick={() => openConnection()}><Cable />Add upstream</Button><Button onClick={() => setCreateOpen(true)}><Plus />Create model profile</Button></div></CardContent></Card>
          )}
      </section>

      <UpstreamInventory accounts={providerAccounts} models={deployments} loading={accounts.isPending || models.isPending} error={accounts.error?.message ?? models.error?.message} onAdd={() => openConnection()} onAddModel={openConnection} />

      <CreateProfileSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        availableModels={deployments}
        modelsLoading={models.isPending}
        modelsError={models.error?.message}
        onAddUpstream={() => { setCreateOpen(false); openConnection(); }}
      />
      <ProviderRegistrationDrawer open={connectionOpen} onOpenChange={setConnectionOpen} initialAccount={drawerAccount} />
    </div>
  );
}

function Layer({ icon: Icon, label, value }: { icon: typeof Database; label: string; value: string }) {
  return <div className="flex min-h-28 flex-col justify-between border-r p-4 last:border-r-0"><Icon className="size-4 text-primary" /><div><span className="block text-[11px] text-muted-foreground">{label}</span><strong className="mt-1 block text-xs font-medium">{value}</strong></div></div>;
}

function ProfileRow({ profile, onRefresh, refreshing }: { profile: ModelProfile; onRefresh: () => void; refreshing: boolean }) {
  return <tr className="group hover:bg-muted/20">
    <td className="px-4 py-4"><div className="flex items-center gap-3"><span className="grid size-9 shrink-0 place-items-center border bg-background text-primary"><SlidersHorizontal className="size-4" /></span><span className="min-w-0"><span className="flex items-center gap-2"><strong className="block truncate">{profile.name}</strong>{profile.isDefault ? <span className="border bg-muted px-1.5 py-0.5 text-[10px] font-medium">Default</span> : null}</span><span className="mt-0.5 block max-w-64 truncate text-xs text-muted-foreground">{profile.description || "Managed model access profile"}</span></span></div></td>
    <td className="px-4 py-4"><code className="text-xs">{profile.publicModelAlias}</code></td>
    <td className="px-4 py-4 text-xs"><strong className="block font-medium">{capability(profile.capabilities.automaticRouting)} routing</strong><span className="text-muted-foreground">{profile.capabilities.failover === "ENABLED" ? "Failover enabled" : "Policy managed"}</span></td>
    <td className="px-4 py-4 text-xs"><strong className="block font-medium">{profile.complianceDomain === "CN_MAINLAND" ? "CN Mainland" : "Global"}</strong><span className="text-muted-foreground">Isolated key</span></td>
    <td className="px-4 py-4 font-mono text-xs">{profile.consumers}</td>
    <td className="px-4 py-4"><Status status={profile.status} /></td>
    <td className="px-3 py-4"><div className="flex justify-end gap-1"><Button size="icon" variant="ghost" aria-label={`Refresh ${profile.name}`} disabled={refreshing} onClick={onRefresh}><RefreshCw className={cn(refreshing && "animate-spin")} /></Button><Button asChild size="sm" variant="ghost"><Link to="/providers/model-profiles/$profileId" params={{ profileId: profile.id }}>Open <ArrowRight /></Link></Button></div></td>
  </tr>;
}

function ProfileMobileCard({ profile }: { profile: ModelProfile }) {
  return <Link to="/providers/model-profiles/$profileId" params={{ profileId: profile.id }} className="block p-4 hover:bg-muted/20 focus-visible:outline-2"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><strong>{profile.name}</strong>{profile.isDefault ? <span className="border bg-muted px-1.5 py-0.5 text-[10px]">Default</span> : null}</div><code className="mt-1 block text-xs text-muted-foreground">{profile.publicModelAlias}</code></div><Status status={profile.status} /></div><div className="mt-4 grid grid-cols-3 border-y py-3 text-xs"><Fact label="Routing" value={capability(profile.capabilities.automaticRouting)} /><Fact label="Compliance" value={profile.complianceDomain === "CN_MAINLAND" ? "CN" : "Global"} /><Fact label="Consumers" value={String(profile.consumers)} /></div></Link>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <span><span className="block text-muted-foreground">{label}</span><strong className="mt-1 block font-medium">{value}</strong></span>;
}

export function Status({ status }: { status: ModelProfileStatus }) {
  const ready = status === "READY";
  const warning = status === "DEGRADED" || status === "DRAFT" || status === "VALIDATING";
  const label = status === "READY" ? "Ready" : status === "VALIDATING" ? "Validating" : status === "DEGRADED" ? "Needs attention" : status.replaceAll("_", " ");
  return <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium", ready ? "text-emerald-700" : warning ? "text-amber-700" : "text-destructive")}><span className={cn("size-1.5 rounded-full", ready ? "bg-emerald-500" : warning ? "bg-amber-500" : "bg-current")} />{label}</span>;
}

function capability(value: ModelProfileCapabilityState): string {
  return value === "ENABLED" ? "Automatic" : value === "DISABLED" ? "Direct" : "Managed";
}

function UpstreamInventory({ accounts, models, loading, error, onAdd, onAddModel }: { accounts: ProviderAccount[]; models: ModelDeployment[]; loading: boolean; error?: string | undefined; onAdd: () => void; onAddModel: (account: ProviderAccount) => void }) {
  return <section aria-labelledby="upstreams-title" className="space-y-4">
    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h2 id="upstreams-title" className="text-lg font-medium">Upstream resource pool</h2><span className="border bg-muted px-2 py-0.5 text-[10px] font-medium">Used by profiles</span></div><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Credentials and model deployments available to LiteLLM routing. A Profile’s exact candidate set remains governed and inspected in LiteLLM.</p></div><Button variant="outline" onClick={onAdd}><Plus />Add upstream</Button></div>
    {loading ? <LoadingState label="Loading upstream resources…" /> : error ? <ErrorState message={error} /> : accounts.length ? <Card><CardContent className="divide-y p-0">{accounts.map((account) => <UpstreamRow key={account.id} account={account} models={models.filter((model) => model.providerAccountId === account.id)} onAddModel={() => onAddModel(account)} />)}</CardContent></Card> : <div className="border border-dashed p-8 text-center"><Cable className="mx-auto size-6 text-muted-foreground" /><p className="mt-3 text-sm font-medium">No upstream connections</p><p className="mt-1 text-xs text-muted-foreground">Connect at least one provider before relying on a routed profile.</p><Button className="mt-4" variant="outline" onClick={onAdd}>Add upstream connection</Button></div>}
  </section>;
}

function UpstreamRow({ account, models, onAddModel }: { account: ProviderAccount; models: ModelDeployment[]; onAddModel: () => void }) {
  const queryClient = useQueryClient();
  const revalidate = useMutation({ mutationFn: () => api.revalidateProviderAccount(account.id), onSuccess: async () => Promise.all([queryClient.invalidateQueries({ queryKey: ["provider-accounts"] }), queryClient.invalidateQueries({ queryKey: ["model-deployments"] })]) });
  const remove = useMutation({ mutationFn: () => api.deleteProviderAccount(account.id), onSuccess: async () => Promise.all([queryClient.invalidateQueries({ queryKey: ["provider-accounts"] }), queryClient.invalidateQueries({ queryKey: ["model-deployments"] })]) });
  const providerName = providerPresets.find((item) => item.id === account.providerKind)?.name ?? account.providerKind;
  return <div className="grid gap-4 p-4 md:grid-cols-[minmax(13rem,1.1fr)_minmax(12rem,1fr)_minmax(12rem,1fr)_auto] md:items-center">
    <div className="flex min-w-0 items-center gap-3"><ProviderIcon presetId={account.presetId} className="size-10 shrink-0 [&_img]:size-6" /><span className="min-w-0"><strong className="block truncate text-sm">{account.name}</strong><span className="block text-xs text-muted-foreground">{providerName}</span></span></div>
    <div className="min-w-0 text-xs"><span className="block truncate font-mono">{account.endpoint}</span><span className="mt-1 block text-muted-foreground">{account.complianceDomain === "CN_MAINLAND" ? "CN Mainland" : "Global"} · credential stored</span></div>
    <div className="text-xs"><strong className="block font-medium">{models.filter((model) => model.status === "VALIDATED").length} ready model{models.length === 1 ? "" : "s"}</strong><span className="mt-1 block truncate text-muted-foreground">{models.slice(0, 3).map((model) => model.displayName).join(", ") || "No model registered"}</span></div>
    <div className="flex items-center justify-between gap-2 md:justify-end"><ProviderStatus status={account.status} /><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Actions for ${account.name}`}><Ellipsis /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={onAddModel}><Plus />Add model</DropdownMenuItem><DropdownMenuItem disabled={revalidate.isPending} onSelect={() => revalidate.mutate()}><RefreshCw />Revalidate</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive" disabled={remove.isPending} onSelect={() => { if (window.confirm(`Delete ${account.name} and its registered models?`)) remove.mutate(); }}><Trash2 />Delete connection</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
  </div>;
}

function ProviderStatus({ status }: { status: ProviderResourceStatus }) {
  const healthy = status === "VALIDATED";
  return <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", healthy ? "text-emerald-700" : status === "DEGRADED" ? "text-amber-700" : "text-destructive")}><span className="size-1.5 rounded-full bg-current" />{healthy ? "Healthy" : status === "DEGRADED" ? "Degraded" : "Failed"}</span>;
}

function LoadingState({ label }: { label: string }) {
  return <div className="flex min-h-40 items-center justify-center gap-3 border text-sm text-muted-foreground"><Spinner />{label}</div>;
}

function ErrorState({ message }: { message: string }) {
  return <div role="alert" className="border-l-2 border-destructive bg-destructive/5 p-4 text-sm text-destructive">{message}</div>;
}

function CreateProfileSheet({
  availableModels,
  modelsError,
  modelsLoading,
  onAddUpstream,
  onOpenChange,
  open,
}: {
  availableModels: ModelDeployment[];
  modelsError?: string | undefined;
  modelsLoading: boolean;
  onAddUpstream: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const queryClient = useQueryClient();
  const gateways = useQuery({ queryKey: ["inference-gateways"], queryFn: api.listInferenceGateways, enabled: open });
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [modelSource, setModelSource] = useState<"catalog" | "custom">("catalog");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [alias, setAlias] = useState("");
  const [makeDefault, setMakeDefault] = useState(true);
  const [attempted, setAttempted] = useState(false);
  const gateway = gateways.data?.[0];
  const compatibleModels = useMemo(
    () => availableModels.filter((model) =>
      model.status === "VALIDATED"
      && (!gateway || model.complianceDomain === gateway.complianceDomain)),
    [availableModels, gateway],
  );
  const selectedModel = compatibleModels.find((model) => model.id === selectedModelId);
  const publicModelAlias = modelSource === "catalog" ? selectedModel?.litellmModelName ?? "" : alias.trim();

  useEffect(() => {
    if (!open) return;
    setModelSource("catalog");
    setSelectedModelId("");
    setAlias("");
    setAttempted(false);
  }, [open]);

  useEffect(() => {
    if (!open || modelSource !== "catalog" || selectedModelId || !compatibleModels.length) return;
    setSelectedModelId((compatibleModels.find((model) => model.isDefault) ?? compatibleModels[0])!.id);
  }, [compatibleModels, modelSource, open, selectedModelId]);

  const mutation = useMutation({
    mutationFn: () => api.createModelProfile({ name, description, gatewayId: gateway?.id ?? "", publicModelAlias, complianceDomain: gateway?.complianceDomain ?? "GLOBAL", isDefault: makeDefault, keyPolicy: { perInstance: true, rotationDays: 90 }, auditPolicy: { controlPlane: true, requestLogs: true, capturePrompts: false } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["model-profiles"] });
      setName(""); setDescription(""); setSelectedModelId(""); setAlias(""); setAttempted(false);
      onOpenChange(false);
    },
  });
  const nameValid = name.trim().length >= 2;
  const modelValid = publicModelAlias.length > 0;
  const gatewayAvailable = Boolean(gateways.data?.length);
  const submit = () => {
    setAttempted(true);
    if (!nameValid || !modelValid || !gatewayAvailable) return;
    mutation.mutate();
  };
  return <EntityFormSheet
    open={open}
    onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}
    eyebrow="Model Profile"
    title="Create Model Profile"
    description="Choose the model Instances will use, then apply a stable access and policy boundary around it."
    width="lg"
    footer={<><Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>Cancel</Button><Button className="min-w-48" disabled={mutation.isPending || gateways.isPending || !gatewayAvailable || (modelSource === "catalog" && modelsLoading)} onClick={submit}>{mutation.isPending ? "Validating profile…" : "Create and validate profile"}</Button></>}
  >
    <div className="space-y-6">
      <section className="space-y-4"><SectionTitle number="01" title="Profile identity" description="What operators see when choosing a model." /><div className="grid items-start gap-4 sm:grid-cols-2"><Field label="Profile name" htmlFor="profile-name" help={attempted && !nameValid ? "Enter at least 2 characters." : "Use a workload or policy-oriented name."} invalid={attempted && !nameValid}><Input id="profile-name" value={name} aria-invalid={attempted && !nameValid} onChange={(event) => setName(event.target.value)} placeholder="Production reasoning" /></Field><Field label="Description" htmlFor="profile-description" help="Optional context for profile consumers."><Textarea id="profile-description" className="min-h-20" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Balanced reasoning for production Agents" /></Field></div></section>
      <section className="space-y-4 border-t pt-5">
        <SectionTitle number="02" title="Model selection" description="Choose a validated model from the current upstream pool." />
        <div className="grid items-start gap-4 sm:grid-cols-2">
          {modelSource === "catalog" ? (
            <Field
              label="Available model"
              htmlFor="profile-model"
              help={attempted && !modelValid ? "Choose a model before creating this profile." : selectedModel ? `${selectedModel.providerName} · ${modelTypeLabel(selectedModel.modelType)} · ${selectedModel.complianceDomain === "CN_MAINLAND" ? "CN Mainland" : "Global"}` : modelsLoading ? "Loading validated models…" : "Only validated, compliance-compatible models are shown."}
              invalid={attempted && !modelValid}
            >
              <Select value={selectedModelId} disabled={modelsLoading || !compatibleModels.length} onValueChange={setSelectedModelId}>
                <SelectTrigger id="profile-model" aria-label="Available model" aria-invalid={attempted && !modelValid}>
                  <SelectValue placeholder={modelsLoading ? "Loading models…" : compatibleModels.length ? "Choose a model" : "No compatible models"} />
                </SelectTrigger>
                <SelectContent>
                  {compatibleModels.map((model) => <SelectItem key={model.id} value={model.id}>{model.displayName} · {model.providerName}{model.isDefault ? " · Default" : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          ) : (
            <Field
              label="Existing router alias"
              htmlFor="profile-alias"
              help={attempted && !modelValid ? "Enter an existing LiteLLM router alias." : "Use this only when routing is already configured outside TaskLattice."}
              invalid={attempted && !modelValid}
            >
              <Input id="profile-alias" value={alias} aria-invalid={attempted && !modelValid} onChange={(event) => setAlias(event.target.value)} placeholder="production-reasoning" />
            </Field>
          )}
          <Field label="Gateway" help={gatewayAvailable ? "Platform-managed routing boundary." : "A Gateway is required before this profile can be created."} invalid={!gateways.isPending && !gatewayAvailable}><div className="flex h-11 items-center border bg-muted/30 px-3 text-sm">{gateways.isPending ? "Loading…" : gateway?.name ?? "Unavailable"}</div></Field>
        </div>

        {selectedModel && modelSource === "catalog" ? <div className="grid gap-px border bg-border text-xs sm:grid-cols-3"><ModelFact label="Provider model" value={selectedModel.modelId} mono /><ModelFact label="Gateway model name" value={selectedModel.litellmModelName} mono /><ModelFact label="Validation" value="Ready" /></div> : null}

        {modelsError && modelSource === "catalog" ? <p role="alert" className="border-l-2 border-destructive bg-destructive/5 p-3 text-xs text-destructive">{modelsError}</p> : null}

        {!modelsLoading && !compatibleModels.length && modelSource === "catalog" ? <div className="flex flex-col gap-3 border-l-2 border-amber-500 bg-amber-500/5 p-3 text-xs leading-5 sm:flex-row sm:items-center sm:justify-between"><span className="flex gap-2"><CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-700" />{availableModels.some((model) => model.status === "VALIDATED") ? `No validated model matches the ${gateway?.complianceDomain === "CN_MAINLAND" ? "CN Mainland" : "Global"} Gateway compliance boundary.` : "No validated upstream model is available yet."}</span><Button type="button" size="sm" variant="outline" onClick={onAddUpstream}>Add upstream</Button></div> : null}

        <button type="button" className="min-h-11 text-left text-xs font-medium text-primary underline underline-offset-4 focus-visible:outline-2" onClick={() => { setModelSource((current) => current === "catalog" ? "custom" : "catalog"); setAttempted(false); }}>{modelSource === "catalog" ? "Use an existing LiteLLM router alias instead" : "Choose from registered models"}</button>
      </section>
      <section className="space-y-4 border-t pt-5"><SectionTitle number="03" title="Access & guardrails" description="Policies applied whenever an Instance consumes this profile." /><div className="grid gap-3 sm:grid-cols-3"><PolicyFact icon={ShieldCheck} label="Compliance" value={gateways.data?.[0]?.complianceDomain === "CN_MAINLAND" ? "CN Mainland" : "Global"} /><PolicyFact icon={KeyRound} label="Credentials" value="Isolated per Instance" /><PolicyFact icon={Activity} label="Audit" value="Control plane + requests" /></div><button type="button" aria-pressed={makeDefault} className={cn("flex min-h-11 w-full items-center gap-3 border px-3 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary", makeDefault && "border-primary bg-primary/5")} onClick={() => setMakeDefault((value) => !value)}><span className={cn("grid size-5 shrink-0 place-items-center border", makeDefault && "border-primary bg-primary text-primary-foreground")}><Check className="size-3.5" /></span><span><strong className="block font-medium">Default Model Profile</strong><span className="text-xs text-muted-foreground">Automatically selected for new Instances.</span></span></button></section>
      {mutation.error ? <p role="alert" className="flex gap-2 text-xs text-destructive"><CircleAlert className="size-4" />{mutation.error.message}</p> : null}
    </div>
  </EntityFormSheet>;
}

function SectionTitle({ number, title, description }: { number: string; title: string; description: string }) {
  return <div className="flex gap-3"><span className="font-mono text-xs text-primary">{number}</span><div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-xs text-muted-foreground">{description}</p></div></div>;
}

function Field({ children, help, htmlFor, invalid, label }: { children: React.ReactNode; help: string; htmlFor?: string; invalid?: boolean; label: string }) {
  return <div className="space-y-2"><Label htmlFor={htmlFor}>{label}</Label>{children}<p className={cn("min-h-5 text-xs leading-5", invalid ? "text-destructive" : "text-muted-foreground")}>{help}</p></div>;
}

function PolicyFact({ icon: Icon, label, value }: { icon: typeof ShieldCheck; label: string; value: string }) {
  return <div className="flex min-h-20 gap-3 border p-3"><Icon className="size-4 shrink-0 text-primary" /><span><span className="block text-xs text-muted-foreground">{label}</span><strong className="mt-1 block text-xs font-medium">{value}</strong></span></div>;
}

function ModelFact({ label, mono = false, value }: { label: string; mono?: boolean; value: string }) {
  return <div className="min-w-0 bg-background p-3"><span className="block text-muted-foreground">{label}</span><strong className={cn("mt-1 block truncate font-medium", mono && "font-mono")} title={value}>{value}</strong></div>;
}

function modelTypeLabel(type: ModelDeployment["modelType"]) {
  return type === "llm" ? "Language model" : type === "text-embedding" ? "Embedding" : "Speech to text";
}
