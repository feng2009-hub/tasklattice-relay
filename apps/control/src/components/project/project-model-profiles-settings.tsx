import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type {
  ModelDeployment,
  ModelProfile,
  ModelType,
  ProviderAccount,
} from "@tasklattice/contracts";
import {
  ArrowRight,
  AudioLines,
  BrainCircuit,
  Cable,
  Check,
  CircleAlert,
  Database,
  FileScan,
  Globe2,
  Plus,
  RefreshCw,
  Route as RouteIcon,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Workflow,
} from "lucide-react";
import { CreateModelProfileSheet } from "@/components/providers/create-model-profile-sheet";
import { ModelProfileStatus } from "@/components/providers/model-profile-status";
import { ProviderIcon } from "@/components/providers/provider-icon";
import { ProviderRegistrationDrawer } from "@/components/providers/provider-registration-drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useProjectQueryScope } from "@/hooks/use-project-query-scope";
import { useCurrentProjectId } from "@/hooks/use-project";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Project } from "@/types/project";

type CapabilityFilter = "all" | ModelType;

const modelTypeLabels: Record<ModelType, string> = {
  llm: "Chat & reasoning",
  "text-embedding": "Embedding",
  "speech-to-text": "Speech to text",
};

export function ProjectModelProfilesSettings({ project }: { project: Project }) {
  return <CurrentProjectModelProfiles project={project} />;
}

function CurrentProjectModelProfiles({ project }: { project: Project }) {
  const scope = useProjectQueryScope();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  const [capability, setCapability] = useState<CapabilityFilter>("all");
  const canManage = project.role === "admin";
  const profiles = useQuery({
    queryKey: scope.key("model-profiles"),
    queryFn: api.listModelProfiles,
  });
  const deployments = useQuery({
    queryKey: scope.key("model-deployments"),
    queryFn: api.listModelDeployments,
  });
  const accounts = useQuery({
    queryKey: scope.key("provider-accounts"),
    queryFn: api.listProviderAccounts,
  });
  const setDefault = useMutation({
    mutationFn: (profile: ModelProfile) =>
      api.updateModelProfile(profile.id, { isDefault: true }),
    onSuccess: async (profile) => {
      setSuccessMessage(`${profile.name} is now the Project default.`);
      await queryClient.invalidateQueries({
        queryKey: scope.key("model-profiles"),
      });
    },
  });
  const refresh = useMutation({
    mutationFn: api.refreshModelProfile,
    onSuccess: async () =>
      queryClient.invalidateQueries({
        queryKey: scope.key("model-profiles"),
      }),
  });
  const items = profiles.data ?? [];
  const models = deployments.data ?? [];
  const providerAccounts = accounts.data ?? [];
  const defaultProfile = items.find((profile) => profile.isDefault);
  const visibleModels = useMemo(() => {
    const query = modelSearch.trim().toLowerCase();
    return models.filter((model) => {
      const account = providerAccounts.find(
        (candidate) => candidate.id === model.providerAccountId,
      );
      return (
        (capability === "all" || model.modelType === capability) &&
        (!query ||
          [
            model.displayName,
            model.modelId,
            model.providerName,
            account?.name ?? "",
            modelTypeLabels[model.modelType],
          ]
            .join(" ")
            .toLowerCase()
            .includes(query))
      );
    });
  }, [capability, modelSearch, models, providerAccounts]);
  const modelInventoryPending = deployments.isPending || accounts.isPending;
  const modelInventoryError = deployments.error ?? accounts.error;

  return (
    <div className="divide-y">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold">Models & routing</h3>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
            Provider connections supply model endpoints. Profiles turn those
            endpoints into a stable policy for routing, resilience, regional
            compliance, and isolated access.
          </p>
        </div>
        {canManage ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              className="h-11"
              variant="outline"
              onClick={() => setConnectionOpen(true)}
            >
              <Cable />
              Add provider
            </Button>
            <Button
              className="h-11"
              disabled={!models.some((model) => model.status === "VALIDATED")}
              title={
                models.some((model) => model.status === "VALIDATED")
                  ? undefined
                  : "Add and validate a model before creating a Profile."
              }
              onClick={() => setCreateOpen(true)}
            >
              <Plus />
              Create profile
            </Button>
          </div>
        ) : null}
      </div>

      <ConceptMap />

      <section aria-labelledby="available-models-title">
        <div className="flex flex-col gap-4 p-5 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 id="available-models-title" className="text-sm font-semibold">
                Available models
              </h3>
              <span className="text-xs tabular-nums text-muted-foreground">
                {models.filter((model) => model.status === "VALIDATED").length}{" "}
                ready
              </span>
            </div>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
              Model endpoints registered for this Project. The same model can
              appear more than once when it is supplied by different Providers.
            </p>
          </div>
          {models.length ? (
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <div className="relative sm:w-64">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  aria-label="Search available models"
                  placeholder="Search models…"
                  value={modelSearch}
                  onChange={(event) => setModelSearch(event.target.value)}
                />
              </div>
              <Select
                value={capability}
                onValueChange={(value) =>
                  setCapability(value as CapabilityFilter)
                }
              >
                <SelectTrigger
                  className="w-full sm:w-44"
                  aria-label="Filter by capability"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All capabilities</SelectItem>
                  <SelectItem value="llm">Chat & reasoning</SelectItem>
                  <SelectItem value="text-embedding">Embedding</SelectItem>
                  <SelectItem value="speech-to-text">
                    Speech to text
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>

        {modelInventoryPending ? (
          <LoadingState label="Loading available models…" />
        ) : modelInventoryError ? (
          <ErrorState
            message={modelInventoryError.message}
            onRetry={() => {
              void deployments.refetch();
              void accounts.refetch();
            }}
          />
        ) : models.length ? (
          <ModelInventory
            accounts={providerAccounts}
            models={visibleModels}
            total={models.length}
          />
        ) : (
          <div className="grid min-h-44 place-items-center border-t bg-muted/[0.08] p-6 text-center">
            <div>
              <span className="mx-auto grid size-9 place-items-center rounded-md border bg-background text-muted-foreground">
                <Database className="size-4" />
              </span>
              <h4 className="mt-3 text-sm font-semibold">
                No models are available yet
              </h4>
              <p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">
                Add a Provider connection, discover its models, and validate at
                least one endpoint before building a routing Profile.
              </p>
              {canManage ? (
                <Button
                  className="mt-4 h-11"
                  variant="outline"
                  onClick={() => setConnectionOpen(true)}
                >
                  <Cable />
                  Add first provider
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </section>

      <section aria-labelledby="routing-profiles-title">
        <div className="flex flex-col gap-4 p-5 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 id="routing-profiles-title" className="text-sm font-semibold">
                Routing profiles
              </h3>
              <span className="text-xs tabular-nums text-muted-foreground">
                {items.length}
              </span>
            </div>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
              A Profile exposes one model identity to Instances while LiteLLM
              applies model selection, failover, retries, and a regional
              boundary behind it.
            </p>
          </div>
          {canManage && models.some((model) => model.status === "VALIDATED") ? (
            <Button
              className="h-11 shrink-0"
              variant="outline"
              onClick={() => setCreateOpen(true)}
            >
              <Plus />
              New profile
            </Button>
          ) : null}
        </div>

        {profiles.isPending ? (
          <LoadingState label="Loading routing Profiles…" />
        ) : profiles.error ? (
          <ErrorState
            message={profiles.error.message}
            onRetry={() => void profiles.refetch()}
          />
        ) : items.length ? (
          <>
            {!defaultProfile ? (
              <div
                role="alert"
                className="flex gap-3 border-y border-amber-500/20 bg-amber-500/5 px-5 py-4 text-sm"
              >
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-700" />
                <span>
                  <strong className="block">No default Profile</strong>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    New Instances cannot receive model access until a Ready
                    Profile is selected.
                  </span>
                </span>
              </div>
            ) : null}

            {successMessage ? (
              <p
                role="status"
                className="border-l-2 border-emerald-500 bg-emerald-500/5 px-5 py-3 text-sm text-emerald-800"
              >
                {successMessage}
              </p>
            ) : null}
            {setDefault.error ? (
              <p
                role="alert"
                className="border-l-2 border-destructive bg-destructive/5 px-5 py-3 text-sm text-destructive"
              >
                {setDefault.error.message}
              </p>
            ) : null}

            <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(11rem,0.8fr)_minmax(10rem,0.7fr)_auto] gap-4 border-y bg-muted/20 px-5 py-2.5 text-xs font-medium text-muted-foreground md:grid">
              <span>Profile</span>
              <span>Routing policy</span>
              <span>Boundary</span>
              <span className="pr-2 text-right">Actions</span>
            </div>
            <ul
              className="divide-y"
              aria-label={`${project.name} routing Profiles`}
            >
              {items.map((profile) => (
                <ProfileSettingRow
                  key={profile.id}
                  canManage={canManage}
                  profile={profile}
                  refreshing={
                    refresh.isPending && refresh.variables === profile.id
                  }
                  selecting={
                    setDefault.isPending &&
                    setDefault.variables?.id === profile.id
                  }
                  onRefresh={() => refresh.mutate(profile.id)}
                  onSelectDefault={() => {
                    setSuccessMessage("");
                    setDefault.mutate(profile);
                  }}
                />
              ))}
            </ul>
          </>
        ) : (
          <ProfileEmptyState
            canCreate={
              canManage &&
              models.some((model) => model.status === "VALIDATED")
            }
            hasModels={models.length > 0}
            onAddProvider={() => setConnectionOpen(true)}
            onCreate={() => setCreateOpen(true)}
          />
        )}
      </section>

      <CreateModelProfileSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        availableModels={models}
        defaultIsDefault={!defaultProfile}
        modelsLoading={deployments.isPending}
        {...(deployments.error?.message
          ? { modelsError: deployments.error.message }
          : {})}
        onAddUpstream={() => {
          setCreateOpen(false);
          setConnectionOpen(true);
        }}
      />
      <ProviderRegistrationDrawer
        open={connectionOpen}
        onOpenChange={setConnectionOpen}
      />
    </div>
  );
}

function ConceptMap() {
  return (
    <div className="grid bg-muted/[0.14] lg:grid-cols-[minmax(0,1fr)_2.5rem_minmax(0,1fr)_2.5rem_minmax(0,1fr)] lg:items-stretch">
      <Concept
        index="01"
        icon={<Cable className="size-4" />}
        title="Provider"
        description="The supplier connection, credentials, endpoint, and commercial boundary."
      />
      <ConceptArrow />
      <Concept
        index="02"
        icon={<Database className="size-4" />}
        title="Model endpoint"
        description="A callable model deployment from one Provider, with capability and health."
      />
      <ConceptArrow />
      <Concept
        index="03"
        icon={<Workflow className="size-4" />}
        title="Profile"
        description="A reusable LiteLLM policy that combines models with routing and guardrails."
      />
    </div>
  );
}

function Concept({
  description,
  icon,
  index,
  title,
}: {
  description: string;
  icon: ReactNode;
  index: string;
  title: string;
}) {
  return (
    <div className="flex gap-3 border-t p-4 first:border-t-0 lg:border-t-0">
      <span className="grid size-8 shrink-0 place-items-center rounded-md border bg-background text-primary">
        {icon}
      </span>
      <span>
        <span className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-muted-foreground">
            {index}
          </span>
          <strong className="text-xs">{title}</strong>
        </span>
        <span className="mt-1 block max-w-sm text-xs leading-5 text-muted-foreground">
          {description}
        </span>
      </span>
    </div>
  );
}

function ConceptArrow() {
  return (
    <span className="hidden items-center justify-center border-x text-muted-foreground/50 lg:flex">
      <ArrowRight className="size-4" />
    </span>
  );
}

function ModelInventory({
  accounts,
  models,
  total,
}: {
  accounts: ProviderAccount[];
  models: ModelDeployment[];
  total: number;
}) {
  if (!models.length) {
    return (
      <div className="border-t bg-muted/[0.08] px-5 py-10 text-center">
        <Search className="mx-auto size-5 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium">No models match these filters</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Try a different name, Provider, or capability.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="hidden overflow-x-auto border-t md:block">
        <table className="w-full min-w-[760px] text-left">
          <thead className="border-b bg-muted/20 text-xs text-muted-foreground">
            <tr>
              <th className="px-5 py-2.5 font-medium">Model</th>
              <th className="px-4 py-2.5 font-medium">Provider</th>
              <th className="px-4 py-2.5 font-medium">Capability</th>
              <th className="px-4 py-2.5 font-medium">Availability</th>
              <th className="px-5 py-2.5 font-medium">Region</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {models.map((model) => {
              const account = accounts.find(
                (candidate) => candidate.id === model.providerAccountId,
              );
              return (
                <tr key={model.id} className="hover:bg-muted/[0.12]">
                  <td className="px-5 py-3">
                    <strong className="block text-sm font-medium">
                      {model.displayName}
                    </strong>
                    <code className="mt-0.5 block max-w-xs truncate text-[11px] text-muted-foreground">
                      {model.modelId}
                    </code>
                  </td>
                  <td className="px-4 py-3">
                    <ProviderCell account={account} model={model} />
                  </td>
                  <td className="px-4 py-3">
                    <Capability model={model} />
                  </td>
                  <td className="px-4 py-3">
                    <Availability model={model} />
                  </td>
                  <td className="px-5 py-3">
                    <Region model={model} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="divide-y border-t md:hidden">
        {models.map((model) => {
          const account = accounts.find(
            (candidate) => candidate.id === model.providerAccountId,
          );
          return (
            <article key={model.id} className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <strong className="block truncate text-sm font-medium">
                    {model.displayName}
                  </strong>
                  <code className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                    {model.modelId}
                  </code>
                </div>
                <Availability model={model} compact />
              </div>
              <ProviderCell account={account} model={model} />
              <div className="grid grid-cols-2 gap-3 border-t pt-3">
                <div>
                  <span className="mb-1 block text-[10px] text-muted-foreground">
                    Capability
                  </span>
                  <Capability model={model} />
                </div>
                <div>
                  <span className="mb-1 block text-[10px] text-muted-foreground">
                    Region
                  </span>
                  <Region model={model} />
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <div className="border-t px-5 py-2.5 text-xs text-muted-foreground">
        Showing {models.length} of {total} registered model endpoints
      </div>
    </>
  );
}

function ProviderCell({
  account,
  model,
}: {
  account: ProviderAccount | undefined;
  model: ModelDeployment;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <ProviderIcon
        presetId={model.providerPresetId}
        className="size-8 [&_img]:size-5"
      />
      <span className="min-w-0">
        <strong className="block truncate text-xs font-medium">
          {model.providerName}
        </strong>
        <span className="block max-w-40 truncate text-[11px] text-muted-foreground">
          {account?.name ?? "Provider connection"}
        </span>
      </span>
    </span>
  );
}

function Capability({ model }: { model: ModelDeployment }) {
  const vision =
    model.modelType === "llm" &&
    /(?:vision|ocr|[-_.]vl\b|multimodal)/i.test(
      `${model.displayName} ${model.modelId}`,
    );
  const Icon = vision
    ? FileScan
    : model.modelType === "text-embedding"
      ? Database
      : model.modelType === "speech-to-text"
        ? AudioLines
        : BrainCircuit;
  const label = vision ? "Vision & OCR" : modelTypeLabels[model.modelType];
  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <Icon className="size-3.5 text-muted-foreground" />
      {label}
    </span>
  );
}

function Availability({
  compact = false,
  model,
}: {
  compact?: boolean;
  model: ModelDeployment;
}) {
  const ready = model.status === "VALIDATED";
  const degraded = model.status === "DEGRADED";
  return (
    <span>
      <span
        className={cn(
          "inline-flex items-center gap-2 text-xs font-medium",
          ready
            ? "text-emerald-700"
            : degraded
              ? "text-amber-700"
              : "text-destructive",
        )}
      >
        <span
          className={cn(
            "size-1.5 rounded-full",
            ready
              ? "bg-emerald-500"
              : degraded
                ? "bg-amber-500"
                : "bg-current",
          )}
        />
        {ready ? "Ready" : degraded ? "Degraded" : "Unavailable"}
      </span>
      {!compact && model.validationLatencyMs !== undefined ? (
        <span className="mt-0.5 block text-[11px] tabular-nums text-muted-foreground">
          {model.validationLatencyMs} ms validation
        </span>
      ) : null}
    </span>
  );
}

function Region({ model }: { model: ModelDeployment }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs">
      {model.complianceDomain === "CN_MAINLAND" ? (
        <ShieldCheck className="size-3.5 text-muted-foreground" />
      ) : (
        <Globe2 className="size-3.5 text-muted-foreground" />
      )}
      {model.complianceDomain === "CN_MAINLAND" ? "CN Mainland" : "Global"}
    </span>
  );
}

function ProfileEmptyState({
  canCreate,
  hasModels,
  onAddProvider,
  onCreate,
}: {
  canCreate: boolean;
  hasModels: boolean;
  onAddProvider: () => void;
  onCreate: () => void;
}) {
  return (
    <div className="grid border-t lg:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.65fr)]">
      <div className="bg-muted/[0.1] p-5 sm:p-6">
        <p className="text-xs font-medium">
          One stable model name, four controls
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          <PolicyStep
            icon={<RouteIcon className="size-4" />}
            label="Route"
            description="Send simple work to an efficient model and complex work to a stronger one."
          />
          <ArrowRight className="mx-auto hidden size-4 text-muted-foreground/50 sm:block" />
          <PolicyStep
            icon={<ShieldCheck className="size-4" />}
            label="Guard"
            description="Keep fallbacks inside the selected region and compliance boundary."
          />
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          <PolicyStep
            icon={<RefreshCw className="size-4" />}
            label="Recover"
            description="Retry transient failures and fail over to another healthy Provider."
          />
          <ArrowRight className="mx-auto hidden size-4 text-muted-foreground/50 sm:block" />
          <PolicyStep
            icon={<Check className="size-4" />}
            label="Expose"
            description="Give every Instance the same Profile alias and an isolated Virtual Key."
          />
        </div>
      </div>
      <div className="flex flex-col items-start justify-center border-t p-6 lg:border-l lg:border-t-0">
        <span className="grid size-9 place-items-center rounded-md bg-primary/[0.07] text-primary">
          <SlidersHorizontal className="size-4" />
        </span>
        <h4 className="mt-4 text-sm font-semibold">
          Create the first routing Profile
        </h4>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          The first validated Profile becomes the Project default for new
          Instances.
        </p>
        {canCreate ? (
          <Button className="mt-4 h-11" onClick={onCreate}>
            <Plus />
            Create profile
          </Button>
        ) : (
          <Button
            className="mt-4 h-11"
            variant="outline"
            onClick={onAddProvider}
          >
            <Cable />
            {hasModels ? "Add a ready model" : "Add provider"}
          </Button>
        )}
      </div>
    </div>
  );
}

function PolicyStep({
  description,
  icon,
  label,
}: {
  description: string;
  icon: ReactNode;
  label: string;
}) {
  return (
    <div className="flex min-h-20 gap-3 border bg-background p-3">
      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-primary">
        {icon}
      </span>
      <span>
        <strong className="block text-xs">{label}</strong>
        <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
          {description}
        </span>
      </span>
    </div>
  );
}

function ProfileSettingRow({
  canManage,
  onRefresh,
  onSelectDefault,
  profile,
  refreshing,
  selecting,
}: {
  canManage: boolean;
  onRefresh: () => void;
  onSelectDefault: () => void;
  profile: ModelProfile;
  refreshing: boolean;
  selecting: boolean;
}) {
  const projectId = useCurrentProjectId();
  const canBecomeDefault =
    canManage && profile.status === "READY" && !profile.isDefault;
  const routingLabel =
    profile.routingPolicy.mode === "COMPLEXITY"
      ? "Complexity routing"
      : profile.routingPolicy.mode === "SINGLE"
        ? "Single model"
        : "External LiteLLM alias";
  const routingDetail =
    profile.routingPolicy.mode === "COMPLEXITY"
      ? `${profile.routingPolicy.retries} retries · ${profile.routingPolicy.fallbackModelDeploymentId ? "fallback enabled" : "no fallback"}`
      : profile.routingPolicy.mode === "SINGLE"
        ? "Direct model binding"
        : profile.publicModelAlias;
  return (
    <li
      className={cn(
        "grid gap-4 p-4 md:grid-cols-[minmax(0,1.4fr)_minmax(11rem,0.8fr)_minmax(10rem,0.7fr)_auto] md:items-center md:px-5",
        profile.isDefault && "bg-primary/[0.025]",
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={cn(
            "mt-0.5 grid size-8 shrink-0 place-items-center rounded-md border",
            profile.isDefault
              ? "border-primary/25 bg-primary/10 text-primary"
              : "text-muted-foreground",
          )}
        >
          {profile.isDefault ? (
            <Check className="size-4" />
          ) : (
            <Workflow className="size-4" />
          )}
        </span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <strong className="truncate text-sm">{profile.name}</strong>
            {profile.isDefault ? (
              <span className="rounded-sm bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                Project default
              </span>
            ) : null}
            <ModelProfileStatus status={profile.status} />
          </span>
          <code className="mt-1 block truncate text-[11px] text-muted-foreground">
            {profile.publicModelAlias}
          </code>
          <span className="mt-1 block text-[11px] text-muted-foreground md:hidden">
            {profile.consumers} active{" "}
            {profile.consumers === 1 ? "consumer" : "consumers"}
          </span>
        </span>
      </div>

      <div>
        <span className="block text-[10px] text-muted-foreground md:hidden">
          Routing policy
        </span>
        <strong className="block text-xs font-medium">{routingLabel}</strong>
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
          {routingDetail}
        </span>
      </div>

      <div>
        <span className="block text-[10px] text-muted-foreground md:hidden">
          Boundary
        </span>
        <span className="flex items-center gap-2 text-xs font-medium">
          <ShieldCheck className="size-3.5 text-muted-foreground" />
          {profile.complianceDomain === "CN_MAINLAND"
            ? "CN Mainland"
            : "Global"}
        </span>
        <span className="mt-0.5 block text-[11px] text-muted-foreground">
          {profile.consumers} active{" "}
          {profile.consumers === 1 ? "consumer" : "consumers"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1 md:justify-end">
        <Button
          size="icon"
          variant="ghost"
          aria-label={`Refresh ${profile.name}`}
          disabled={!canManage || refreshing}
          onClick={onRefresh}
        >
          <RefreshCw className={cn(refreshing && "animate-spin")} />
        </Button>
        {!profile.isDefault && canManage ? (
          <Button
            className="h-11"
            variant="outline"
            disabled={!canBecomeDefault || selecting}
            title={
              canBecomeDefault
                ? undefined
                : "Only a Ready Profile can become the Project default."
            }
            onClick={onSelectDefault}
          >
            {selecting ? <Spinner /> : <Check />}
            Set default
          </Button>
        ) : null}
        <Button asChild className="h-11" variant="ghost">
          <Link
            to="/$projectId/setting/model-profiles/$profileId"
            params={{ projectId, profileId: profile.id }}
          >
            Configure
            <ArrowRight />
          </Link>
        </Button>
      </div>
    </li>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex min-h-36 items-center justify-center gap-3 border-t p-5 text-sm text-muted-foreground">
      <Spinner />
      {label}
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 border-t border-l-2 border-l-destructive bg-destructive/5 p-5 text-sm text-destructive"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" />
      <span className="flex-1">{message}</span>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
