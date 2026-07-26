import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  type ModelCapability,
  type ModelDeployment,
  type ModelProfile,
  type ModelType,
  type ProviderAccount,
} from "@tasklattice/contracts";
import {
  ArrowRight,
  AudioLines,
  BrainCircuit,
  Check,
  CircleAlert,
  Database,
  FileScan,
  Info,
  Plus,
  RefreshCw,
  Route as RouteIcon,
  Search,
  Trash2,
  Workflow,
} from "lucide-react";
import { CreateModelProfileSheet } from "@/components/providers/create-model-profile-sheet";
import { GatewaySyncStatus } from "@/components/providers/gateway-sync-status";
import { ProviderConnectionsManagement } from "@/components/providers/provider-connections-management";
import { ProviderIcon } from "@/components/providers/provider-icon";
import { RegisterModelsDrawer } from "@/components/providers/register-models-drawer";
import { DataBoundaryLabel } from "@/components/shared/data-boundary-label";
import { Badge } from "@/components/ui/badge";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useProjectQueryScope } from "@/hooks/use-project-query-scope";
import { useCurrentProjectId } from "@/hooks/use-project";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Project } from "@/types/project";

type ModelTypeFilter = "all" | ModelType;
type ManagementView = "models" | "profiles";

const modelTypeLabels: Record<ModelType, string> = {
  llm: "Text generation",
  "text-embedding": "Embedding",
  "speech-to-text": "Speech to text",
};

const capabilityLabels: Record<ModelCapability, string> = {
  reasoning: "Reasoning",
  vision: "Vision",
  ocr: "OCR",
  "document-understanding": "Documents",
  "tool-calling": "Tools",
  "structured-output": "Structured output",
  code: "Code",
  multilingual: "Multilingual",
};

export function ProjectModelProfilesSettings({ project }: { project: Project }) {
  const scope = useProjectQueryScope();
  const queryClient = useQueryClient();
  const [managementView, setManagementView] =
    useState<ManagementView>("models");
  const [createOpen, setCreateOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerAccount, setRegisterAccount] = useState<ProviderAccount>();
  const [registrationMode, setRegistrationMode] =
    useState<"existing" | "new">("existing");
  const [successMessage, setSuccessMessage] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  const [modelType, setModelType] = useState<ModelTypeFilter>("all");
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
  const removeModel = useMutation({
    mutationFn: (model: ModelDeployment) =>
      api.deleteModelDeployment(model.id),
    onSuccess: async () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: scope.key("model-deployments"),
        }),
        queryClient.invalidateQueries({
          queryKey: scope.key("provider-accounts"),
        }),
      ]),
  });
  const profileItems = profiles.data ?? [];
  const models = deployments.data ?? [];
  const providerAccounts = accounts.data ?? [];
  const defaultProfile = profileItems.find((profile) => profile.isDefault);
  const readyChatModels = models.filter(
    (model) => model.status === "VALIDATED" && model.modelType === "llm",
  );
  const visibleModels = useMemo(() => {
    const query = modelSearch.trim().toLowerCase();
    return models.filter((model) => {
      const account = providerAccounts.find(
        (candidate) => candidate.id === model.providerAccountId,
      );
      return (
        (modelType === "all" || model.modelType === modelType)
        && (
          !query
          || [
            model.displayName,
            model.modelId,
            model.providerName,
            account?.name ?? "",
            modelTypeLabels[model.modelType],
            ...(model.capabilities ?? []).map(
              (capability) => capabilityLabels[capability],
            ),
          ]
            .join(" ")
            .toLowerCase()
            .includes(query)
        )
      );
    });
  }, [modelSearch, modelType, models, providerAccounts]);
  const modelUsage = useMemo(
    () =>
      new Map(
        models.map((model) => [
          model.id,
          profileItems.filter((profile) =>
            deploymentIds(profile).has(model.id),
          ).length,
        ]),
      ),
    [models, profileItems],
  );
  const openModelRegistration = (account?: ProviderAccount) => {
    setRegisterAccount(account);
    setRegistrationMode(
      account || providerAccounts.length ? "existing" : "new",
    );
    setRegisterOpen(true);
  };
  const openProviderConnection = () => {
    setRegisterAccount(undefined);
    setRegistrationMode("new");
    setRegisterOpen(true);
  };

  return (
    <div>
      <header className="border-b p-5">
        <div>
          <h3 className="text-sm font-semibold">Models & Profiles</h3>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
            Models are registered from Provider connections. Profiles define
            how Instances route, retry, and fail over between them.
          </p>
        </div>
      </header>

      <Tabs
        className="gap-0"
        value={managementView}
        onValueChange={(value) => setManagementView(value as ManagementView)}
      >
        <div className="flex flex-col gap-3 border-b px-5 sm:flex-row sm:items-center sm:justify-between">
          <TabsList
            aria-label="Model and Profile management"
            className="h-12 w-full justify-start gap-1 rounded-none bg-transparent p-0 sm:w-auto"
          >
            <TabsTrigger
              className="h-12 rounded-none border-0 px-2 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none"
              value="models"
            >
              <Database />
              Models
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                {models.length}
              </span>
            </TabsTrigger>
            <TabsTrigger
              className="h-12 rounded-none border-0 px-2 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none"
              value="profiles"
            >
              <Workflow />
              Profiles
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                {profileItems.length}
              </span>
            </TabsTrigger>
          </TabsList>
          {canManage ? (
            <div className="flex flex-wrap gap-2 pb-3 sm:pb-0">
              {managementView === "models" ? (
                <>
                  <Button
                    className="h-9"
                    onClick={() =>
                      providerAccounts.length
                        ? openModelRegistration()
                        : openProviderConnection()
                    }
                  >
                    <Plus />
                    {providerAccounts.length
                      ? "Register models"
                      : "Connect Provider"}
                  </Button>
                  {providerAccounts.length ? (
                    <Button
                      className="h-9"
                      variant="outline"
                      onClick={openProviderConnection}
                    >
                      Connect Provider
                    </Button>
                  ) : null}
                </>
              ) : (
                <Button
                  className="h-9"
                  disabled={!readyChatModels.length}
                  title={
                    readyChatModels.length
                      ? undefined
                      : "Register a validated text generation model first."
                  }
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus />
                  Create Profile
                </Button>
              )}
            </div>
          ) : null}
        </div>

        <TabsContent className="mt-0 divide-y" value="models">
          <section aria-labelledby="registered-models-title">
            <div className="flex flex-col gap-4 p-5 pb-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3
                    id="registered-models-title"
                    className="text-sm font-semibold"
                  >
                    Registered models
                  </h3>
                  <Badge variant="outline">
                    {
                      models.filter(
                        (model) => model.status === "VALIDATED",
                      ).length
                    }{" "}
                    ready
                  </Badge>
                  <Tip content="A registered model is one callable Provider endpoint. The same model can appear more than once when supplied by different Providers or regions." />
                </div>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
                  Models available to this Project and to its Profiles.
                </p>
              </div>
              {models.length ? (
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                  <div className="relative sm:w-64">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      aria-label="Search registered models"
                      placeholder="Search models…"
                      value={modelSearch}
                      onChange={(event) => setModelSearch(event.target.value)}
                    />
                  </div>
                  <Select
                    value={modelType}
                    onValueChange={(value) =>
                      setModelType(value as ModelTypeFilter)
                    }
                  >
                    <SelectTrigger
                      className="w-full sm:w-44"
                      aria-label="Filter by model type"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All model types</SelectItem>
                      <SelectItem value="llm">Text generation</SelectItem>
                      <SelectItem value="text-embedding">
                        Embedding
                      </SelectItem>
                      <SelectItem value="speech-to-text">
                        Speech to text
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>

            {removeModel.error ? (
              <p
                role="alert"
                className="border-y border-destructive/20 bg-destructive/5 px-5 py-3 text-sm text-destructive"
              >
                {removeModel.error.message}
              </p>
            ) : null}
            {deployments.isPending || accounts.isPending ? (
              <LoadingState label="Loading registered models…" />
            ) : deployments.error || accounts.error ? (
              <ErrorState
                message={(deployments.error ?? accounts.error)!.message}
                onRetry={() => {
                  void deployments.refetch();
                  void accounts.refetch();
                }}
              />
            ) : models.length ? (
              <ModelTable
                accounts={providerAccounts}
                canManage={canManage}
                models={visibleModels}
                total={models.length}
                usage={modelUsage}
                {...(removeModel.isPending && removeModel.variables
                  ? { removingId: removeModel.variables.id }
                  : {})}
                onRemove={(model) => {
                  if (
                    window.confirm(
                      `Remove ${model.displayName} from this Project?`,
                    )
                  ) {
                    removeModel.mutate(model);
                  }
                }}
              />
            ) : (
              <EmptyState
                icon={<Database className="size-4" />}
                title="No models registered"
                description={
                  providerAccounts.length
                    ? "Register models from a Provider connection to make them available to Profiles."
                    : "Connect a Provider below to discover and register its models."
                }
                action={
                  canManage && providerAccounts.length ? (
                    <Button
                      className="mt-4 h-11"
                      onClick={() => openModelRegistration()}
                    >
                      <Plus />
                      Register first model
                    </Button>
                  ) : null
                }
              />
            )}
          </section>

          <ProviderConnectionsManagement
            accounts={providerAccounts}
            canManage={canManage}
            models={models}
            onRegisterModels={openModelRegistration}
          />
        </TabsContent>

        <TabsContent className="mt-0" value="profiles">
          <section aria-labelledby="profiles-title">
            <div className="p-5 pb-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 id="profiles-title" className="text-sm font-semibold">
                  Profiles
                </h3>
                <Badge variant="outline">{profileItems.length}</Badge>
                <Tip content="Instances call a stable Profile identity while the gateway applies its routing, retry, and fallback policy." />
              </div>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
                Reusable model-use policies exposed to Instances as stable model
                identities.
              </p>
            </div>

            {profiles.isPending ? (
              <LoadingState label="Loading Profiles…" />
            ) : profiles.error ? (
              <ErrorState
                message={profiles.error.message}
                onRetry={() => void profiles.refetch()}
              />
            ) : profileItems.length ? (
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
                <ProfileTable
                  canManage={canManage}
                  profiles={profileItems}
                  {...(refresh.isPending && refresh.variables
                    ? { refreshingId: refresh.variables }
                    : {})}
                  {...(setDefault.isPending && setDefault.variables?.id
                    ? { selectingId: setDefault.variables.id }
                    : {})}
                  onRefresh={(profile) => refresh.mutate(profile.id)}
                  onSelectDefault={(profile) => {
                    setSuccessMessage("");
                    setDefault.mutate(profile);
                  }}
                />
              </>
            ) : (
              <EmptyState
                icon={<Workflow className="size-4" />}
                title="No Profiles yet"
                description={
                  readyChatModels.length
                    ? "Create a fixed, complexity-aware, or semantic routing policy from registered models."
                    : "Register a validated text generation model before creating a Profile."
                }
                action={
                  canManage ? (
                    <Button
                      className="mt-4 h-11"
                      onClick={() => {
                        if (readyChatModels.length) {
                          setCreateOpen(true);
                        } else {
                          setManagementView("models");
                        }
                      }}
                    >
                      <Plus />
                      {readyChatModels.length
                        ? "Create first Profile"
                        : "View Models"}
                    </Button>
                  ) : null
                }
              />
            )}
          </section>
        </TabsContent>
      </Tabs>

      <CreateModelProfileSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        availableModels={models}
        defaultIsDefault={!defaultProfile}
        modelsLoading={deployments.isPending}
        {...(deployments.error?.message
          ? { modelsError: deployments.error.message }
          : {})}
        onRegisterModels={() => {
          setCreateOpen(false);
          setManagementView("models");
          openModelRegistration();
        }}
      />
      <RegisterModelsDrawer
        accounts={providerAccounts}
        initialAccount={registerAccount}
        initialMode={registrationMode}
        open={registerOpen}
        onOpenChange={setRegisterOpen}
      />
    </div>
  );
}

function ModelTable({
  accounts,
  canManage,
  models,
  onRemove,
  removingId,
  total,
  usage,
}: {
  accounts: ProviderAccount[];
  canManage: boolean;
  models: ModelDeployment[];
  onRemove: (model: ModelDeployment) => void;
  removingId?: string;
  total: number;
  usage: Map<string, number>;
}) {
  if (!models.length) {
    return (
      <div className="border-t bg-muted/[0.08] px-5 py-10 text-center">
        <Search className="mx-auto size-5 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium">No models match these filters</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Try a different name, Provider, type, or capability.
        </p>
      </div>
    );
  }
  return (
    <>
      <div className="hidden overflow-x-auto border-t md:block">
        <table className="w-full min-w-[980px] text-left">
          <thead className="border-b bg-muted/20 text-xs text-muted-foreground">
            <tr>
              <th className="px-5 py-2.5 font-medium">Model</th>
              <th className="px-4 py-2.5 font-medium">Provider</th>
              <th className="px-4 py-2.5 font-medium">
                <span className="inline-flex items-center gap-1.5">
                  Type & capabilities
                  <Tip content="Type is the model's primary task. Capabilities describe features such as reasoning, vision, OCR, and tool calling. Multimodal inputs are shown as capabilities, not a separate model type." />
                </span>
              </th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Boundary</th>
              <th className="px-5 py-2.5 text-right font-medium">Used by</th>
              <th className="w-14">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {models.map((model) => {
              const useCount = usage.get(model.id) ?? 0;
              const removalBlocked = useCount > 0;
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
                    <ProviderCell
                      account={accounts.find(
                        (account) => account.id === model.providerAccountId,
                      )}
                      model={model}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <ModelClassification model={model} />
                  </td>
                  <td className="px-4 py-3">
                    <Availability model={model} />
                  </td>
                  <td className="px-4 py-3">
                    <Boundary domain={model.complianceDomain} />
                  </td>
                  <td className="px-5 py-3 text-right text-xs tabular-nums">
                    {useCount} Profile{useCount === 1 ? "" : "s"}
                  </td>
                  <td className="px-2 py-3">
                    {canManage ? (
                      <Button
                        aria-label={`Remove ${model.displayName}`}
                        disabled={
                          removalBlocked || removingId === model.id
                        }
                        size="icon"
                        title={
                          removalBlocked
                            ? "Remove this model from its Profiles first."
                            : "Remove registered model"
                        }
                        variant="ghost"
                        onClick={() => onRemove(model)}
                      >
                        {removingId === model.id
                          ? <Spinner />
                          : <Trash2 />}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="divide-y border-t md:hidden">
        {models.map((model) => {
          const useCount = usage.get(model.id) ?? 0;
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
              <ProviderCell
                account={accounts.find(
                  (account) => account.id === model.providerAccountId,
                )}
                model={model}
              />
              <ModelClassification model={model} />
              <div className="flex items-center justify-between gap-3 border-t pt-3">
                <Boundary domain={model.complianceDomain} />
                <span className="ml-auto text-xs text-muted-foreground">
                  Used by {useCount} Profile{useCount === 1 ? "" : "s"}
                </span>
                {canManage ? (
                  <Button
                    aria-label={`Remove ${model.displayName}`}
                    disabled={useCount > 0 || removingId === model.id}
                    size="icon"
                    title={
                      useCount
                        ? "Remove this model from its Profiles first."
                        : "Remove registered model"
                    }
                    variant="ghost"
                    onClick={() => onRemove(model)}
                  >
                    {removingId === model.id ? <Spinner /> : <Trash2 />}
                  </Button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
      <div className="border-t px-5 py-2.5 text-xs text-muted-foreground">
        Showing {models.length} of {total} registered models
      </div>
    </>
  );
}

function ProfileTable({
  canManage,
  onRefresh,
  onSelectDefault,
  profiles,
  refreshingId,
  selectingId,
}: {
  canManage: boolean;
  onRefresh: (profile: ModelProfile) => void;
  onSelectDefault: (profile: ModelProfile) => void;
  profiles: ModelProfile[];
  refreshingId?: string;
  selectingId?: string;
}) {
  return (
    <div className="overflow-x-auto border-t">
      <table className="w-full min-w-[980px] text-left">
        <thead className="border-b bg-muted/20 text-xs text-muted-foreground">
          <tr>
            <th className="px-5 py-2.5 font-medium">Profile</th>
            <th className="px-4 py-2.5 font-medium">Routing</th>
            <th className="px-4 py-2.5 font-medium">Resilience</th>
            <th className="px-4 py-2.5 font-medium">Boundary</th>
            <th className="px-4 py-2.5 font-medium">Use</th>
            <th className="px-5 py-2.5 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {profiles.map((profile) => (
            <ProfileRow
              key={profile.id}
              canManage={canManage}
              profile={profile}
              refreshing={refreshingId === profile.id}
              selecting={selectingId === profile.id}
              onRefresh={() => onRefresh(profile)}
              onSelectDefault={() => onSelectDefault(profile)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProfileRow({
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
  const routing = routingSummary(profile);
  const fallbackCount =
    profile.routingPolicy.fallbackModelDeploymentIds.length;
  const retries = profile.routingPolicy.retries;
  const canBecomeDefault =
    canManage && profile.status === "READY" && !profile.isDefault;
  return (
    <tr className={cn(profile.isDefault && "bg-primary/[0.025]")}>
      <td className="px-5 py-3">
        <span className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              "mt-0.5 grid size-8 shrink-0 place-items-center rounded-md border",
              profile.isDefault
                ? "border-primary/25 bg-primary/10 text-primary"
                : "text-muted-foreground",
            )}
          >
            {profile.isDefault
              ? <Check className="size-4" />
              : <Workflow className="size-4" />}
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <strong className="text-sm">{profile.name}</strong>
              <GatewaySyncStatus
                compact
                message={profile.validationMessage}
                status={profile.status}
              />
              {profile.isDefault ? (
                <Badge variant="secondary">Project default</Badge>
              ) : null}
            </span>
            <span className="mt-1 block max-w-xs truncate text-[11px] text-muted-foreground">
              {profile.description || profile.publicModelAlias}
            </span>
          </span>
        </span>
      </td>
      <td className="px-4 py-3">
        <strong className="block text-xs font-medium">{routing.label}</strong>
        <span className="mt-0.5 block text-[11px] text-muted-foreground">
          {routing.detail}
        </span>
      </td>
      <td className="px-4 py-3">
        <strong className="block text-xs font-medium">
          {fallbackCount
            ? `${fallbackCount} fallback${fallbackCount === 1 ? "" : "s"}`
            : "No fallback"}
        </strong>
        <span className="mt-0.5 block text-[11px] text-muted-foreground">
          {retries} retries before failover
        </span>
      </td>
      <td className="px-4 py-3">
        <Boundary domain={profile.complianceDomain} />
      </td>
      <td className="px-4 py-3">
        <span className="block text-xs text-muted-foreground">
          {profile.consumers} active Instance
          {profile.consumers === 1 ? "" : "s"}
        </span>
      </td>
      <td className="px-5 py-3">
        <div className="flex items-center justify-end gap-1">
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
          <Button asChild variant="ghost">
            <Link
              to="/$projectId/setting/model-profiles/$profileId"
              params={{ projectId, profileId: profile.id }}
            >
              Configure
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </td>
    </tr>
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

function ModelClassification({ model }: { model: ModelDeployment }) {
  const capabilities = model.capabilities ?? [];
  const Icon =
    model.modelType === "text-embedding"
      ? Database
      : model.modelType === "speech-to-text"
        ? AudioLines
        : capabilities.includes("vision")
          ? FileScan
          : BrainCircuit;
  const visible = capabilities.slice(0, 2);
  const remaining = capabilities.length - visible.length;
  return (
    <span>
      <span className="inline-flex items-center gap-2 text-xs font-medium">
        <Icon className="size-3.5 text-muted-foreground" />
        {modelTypeLabels[model.modelType]}
      </span>
      {visible.length ? (
        <span className="mt-1.5 flex flex-wrap gap-1">
          {visible.map((capability) => (
            <Badge key={capability} variant="outline">
              {capabilityLabels[capability]}
            </Badge>
          ))}
          {remaining > 0 ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline">+{remaining}</Badge>
              </TooltipTrigger>
              <TooltipContent>
                {capabilities
                  .slice(2)
                  .map((capability) => capabilityLabels[capability])
                  .join(", ")}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </span>
      ) : (
        <span className="mt-1 block text-[11px] text-muted-foreground">
          No additional capabilities declared
        </span>
      )}
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

function Boundary({
  domain,
}: {
  domain: ModelDeployment["complianceDomain"];
}) {
  return <DataBoundaryLabel className="text-xs" domain={domain} />;
}

function Tip({ content }: { content: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Info
          className="size-3.5 cursor-help text-muted-foreground"
          aria-label="More information"
        />
      </TooltipTrigger>
      <TooltipContent>{content}</TooltipContent>
    </Tooltip>
  );
}

function EmptyState({
  action,
  description,
  icon,
  title,
}: {
  action: ReactNode;
  description: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <div className="grid min-h-48 place-items-center border-t bg-muted/[0.08] p-6 text-center">
      <div>
        <span className="mx-auto grid size-9 place-items-center rounded-md border bg-background text-muted-foreground">
          {icon}
        </span>
        <h4 className="mt-3 text-sm font-semibold">{title}</h4>
        <p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">
          {description}
        </p>
        {action}
      </div>
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex min-h-36 items-center justify-center gap-2 border-t text-sm text-muted-foreground">
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
    <div className="flex min-h-36 flex-col items-center justify-center border-t p-5 text-center">
      <CircleAlert className="size-5 text-destructive" />
      <p className="mt-2 max-w-lg text-sm text-destructive">{message}</p>
      <Button className="mt-4" variant="outline" onClick={onRetry}>
        <RefreshCw />
        Retry
      </Button>
    </div>
  );
}

function routingSummary(profile: ModelProfile): {
  label: string;
  detail: string;
} {
  if (profile.routingPolicy.mode === "SINGLE") {
    return { label: "Fixed model", detail: "One primary model" };
  }
  if (profile.routingPolicy.mode === "COMPLEXITY") {
    return {
      label: "By complexity",
      detail: "SIMPLE / MEDIUM · COMPLEX / REASONING",
    };
  }
  return {
    label: "By intent",
    detail: `${profile.routingPolicy.routes.length} semantic intent${
      profile.routingPolicy.routes.length === 1 ? "" : "s"
    }`,
  };
}

function deploymentIds(profile: ModelProfile): Set<string> {
  const policy = profile.routingPolicy;
  if (policy.mode === "SINGLE") {
    return new Set([
      policy.modelDeploymentId,
      ...policy.fallbackModelDeploymentIds,
    ]);
  }
  if (policy.mode === "COMPLEXITY") {
    return new Set([
      policy.simpleModelDeploymentId,
      policy.complexModelDeploymentId,
      ...policy.fallbackModelDeploymentIds,
    ]);
  }
  return new Set([
    policy.defaultModelDeploymentId,
    policy.embeddingModelDeploymentId,
    ...policy.routes.map((route) => route.modelDeploymentId),
    ...policy.fallbackModelDeploymentIds,
  ]);
}
