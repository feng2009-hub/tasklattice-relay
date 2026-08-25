import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type ModelCapability,
  type ModelDeployment,
  type ModelRouting,
  type ModelType,
  type ProviderAccount,
} from "@tali/contracts";
import {
  ArrowRight,
  AudioLines,
  BrainCircuit,
  Building2,
  Check,
  CircleAlert,
  Database,
  FileScan,
  Info,
  LockKeyhole,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Workflow,
} from "lucide-react";
import { CreateModelRoutingSheet } from "@/components/providers/create-model-routing-sheet";
import { GatewaySyncStatus } from "@/components/providers/gateway-sync-status";
import {
  InferenceManagementProvider,
  useInferenceManagement,
} from "@/components/providers/inference-management-context";
import { ProviderConnectionsManagement } from "@/components/providers/provider-connections-management";
import { ProviderIcon } from "@/components/providers/provider-icon";
import { RegisterModelsDrawer } from "@/components/providers/register-models-drawer";
import { DataBoundaryLabel } from "@/components/shared/data-boundary-label";
import { DeleteEntitySheet } from "@/components/shared/delete-entity-sheet";
import { EntitySheet } from "@/components/shared/entity-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useProjectQueryScope } from "@/hooks/use-project-query-scope";
import { api, departmentInferenceApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Project } from "@/types/project";

type ModelTypeFilter = "all" | ModelType;
type ManagementView = "models" | "routing";

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

export function ProjectModelRoutingsSettings(props: {
  onViewChange: (view: ManagementView) => void;
  project: Project;
  view: ManagementView;
}) {
  const scope = useProjectQueryScope();
  return (
    <InferenceManagementProvider
      value={{ client: api, key: scope.key, scopeLabel: "Project" }}
    >
      <ModelRoutingsSettingsContent {...props} />
    </InferenceManagementProvider>
  );
}

export function DepartmentModelRoutingsSettings({
  departmentId,
  onViewChange,
  view,
}: {
  departmentId: string;
  onViewChange: (view: ManagementView) => void;
  view: ManagementView;
}) {
  const client = useMemo(
    () => departmentInferenceApi(departmentId),
    [departmentId],
  );
  const key = useMemo(
    () => (...parts: string[]) => ["department", departmentId, ...parts] as const,
    [departmentId],
  );
  return (
    <InferenceManagementProvider
      value={{ client, key, scopeLabel: "Department" }}
    >
      <ModelRoutingsSettingsContent
        onViewChange={onViewChange}
        view={view}
      />
    </InferenceManagementProvider>
  );
}

function ModelRoutingsSettingsContent({
  onViewChange,
  project,
  view,
}: {
  onViewChange: (view: ManagementView) => void;
  project?: Project;
  view: ManagementView;
}) {
  const { client, key, scopeLabel } = useInferenceManagement();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerAccount, setRegisterAccount] = useState<ProviderAccount>();
  const [removingModel, setRemovingModel] = useState<ModelDeployment>();
  const [registrationMode, setRegistrationMode] =
    useState<"existing" | "new">("existing");
  const [successMessage, setSuccessMessage] = useState("");
  const [inheritanceOpen, setInheritanceOpen] = useState(false);
  const [editingRouting, setEditingRouting] = useState<ModelRouting>();
  const [modelSearch, setModelSearch] = useState("");
  const [modelType, setModelType] = useState<ModelTypeFilter>("all");
  const capabilities = new Set(project?.effectiveCapabilities ?? []);
  const departmentManaged = scopeLabel === "Department";
  const canConnectProvider =
    departmentManaged || (
      capabilities.has("CAP_PROVIDER_CREATE")
      && capabilities.has("CAP_PROVIDER_DISCOVER")
    );
  const canRegisterModels =
    departmentManaged || (
      capabilities.has("CAP_MODEL_CREATE")
      && capabilities.has("CAP_PROVIDER_DISCOVER")
    );
  const canDeleteModels = departmentManaged || capabilities.has("CAP_MODEL_DELETE");
  const canValidateProviders = departmentManaged || capabilities.has("CAP_PROVIDER_VALIDATE");
  const canDeleteProviders = departmentManaged || capabilities.has("CAP_PROVIDER_DELETE");
  const canCreateRouting = departmentManaged || capabilities.has("CAP_MODEL_ROUTING_CREATE");
  const canUpdateRouting = departmentManaged || capabilities.has("CAP_MODEL_ROUTING_UPDATE");
  const canReconcileRouting = departmentManaged || capabilities.has("CAP_MODEL_ROUTING_RECONCILE");
  const canDeleteRouting = departmentManaged || capabilities.has("CAP_MODEL_ROUTING_DELETE");
  const routings = useQuery({
    queryKey: key("model-routings"),
    queryFn: client.listModelRoutings,
  });
  const deployments = useQuery({
    queryKey: key("model-deployments"),
    queryFn: client.listModelDeployments,
  });
  const accounts = useQuery({
    queryKey: key("provider-accounts"),
    queryFn: client.listProviderAccounts,
  });
  const setDefault = useMutation({
    mutationFn: (routing: ModelRouting) =>
      client.updateModelRouting(routing.id, { isDefault: true }),
    onSuccess: async (routing) => {
      setSuccessMessage(`${routing.name} is now the ${scopeLabel} default.`);
      await queryClient.invalidateQueries({
        queryKey: key("model-routings"),
      });
    },
  });
  const refresh = useMutation({
    mutationFn: client.refreshModelRouting,
    onSuccess: async () =>
      queryClient.invalidateQueries({
        queryKey: key("model-routings"),
      }),
  });
  const removeModel = useMutation({
    mutationFn: (model: ModelDeployment) =>
      client.deleteModelDeployment(model.id),
    onSuccess: async () => {
      setRemovingModel(undefined);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: key("model-deployments"),
        }),
        queryClient.invalidateQueries({
          queryKey: key("provider-accounts"),
        }),
      ]);
    },
  });
  const routingItems = routings.data ?? [];
  const models = deployments.data ?? [];
  const providerAccounts = accounts.data ?? [];
  const defaultRouting = routingItems.find((routing) => routing.isDefault);
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
          routingItems.filter((routing) =>
            deploymentIds(routing).has(model.id),
          ).length,
        ]),
      ),
    [models, routingItems],
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
      {view === "models" ? (
        <div className="divide-y">
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
                  Models owned by or available to this {scopeLabel} and its routing configurations.
                </p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
                {canConnectProvider || canRegisterModels || project ? (
                  <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
                    {project ? (
                      <Button
                        className="h-11"
                        variant="outline"
                        onClick={() => setInheritanceOpen(true)}
                      >
                        <Building2 />
                        Department models
                      </Button>
                    ) : null}
                    {providerAccounts.length && canRegisterModels ? (
                      <Button
                        className="h-11"
                        onClick={() => openModelRegistration()}
                      >
                        <Plus />
                        Register models
                      </Button>
                    ) : canConnectProvider ? (
                      <Button className="h-11" onClick={openProviderConnection}>
                        <Plus />
                        Connect Provider
                      </Button>
                    ) : null}
                    {providerAccounts.length && canConnectProvider ? (
                      <Button
                        className="h-11"
                        variant="outline"
                        onClick={openProviderConnection}
                      >
                        Connect Provider
                      </Button>
                    ) : null}
                  </div>
                ) : null}
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
                canDelete={canDeleteModels}
                models={visibleModels}
                total={models.length}
                usage={modelUsage}
                {...(removeModel.isPending && removeModel.variables
                  ? { removingId: removeModel.variables.id }
                  : {})}
                onRemove={(model) => {
                  removeModel.reset();
                  setRemovingModel(model);
                }}
              />
            ) : (
              <EmptyState
                icon={<Database className="size-4" />}
                title="No models registered"
                description={
                  providerAccounts.length
                    ? "Register models from a Provider connection before configuring routing."
                    : "Connect a Provider below to discover and register its models."
                }
                action={
                  canRegisterModels && providerAccounts.length ? (
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
            canConnect={canConnectProvider}
            canDelete={canDeleteProviders}
            canRegisterModels={canRegisterModels}
            canValidate={canValidateProviders}
            models={models}
            onConnectProvider={openProviderConnection}
            onRegisterModels={openModelRegistration}
          />
        </div>
      ) : (
        <section aria-labelledby="routings-title">
            <div className="flex flex-col gap-4 p-5 pb-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 id="routings-title" className="text-sm font-semibold">
                    Routing
                  </h3>
                  <Badge variant="outline">{routingItems.length}</Badge>
                  <Tip content="Instances reference a stable routing configuration while LiteLLM applies model selection, retries, and fallback policy." />
                </div>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
                  Reusable routing configurations that Instances reference directly.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 self-start sm:self-auto">
                {project ? (
                  <Button
                    className="h-11"
                    variant="outline"
                    onClick={() => setInheritanceOpen(true)}
                  >
                    <Building2 />
                    Department routing
                  </Button>
                ) : null}
                {canCreateRouting ? (
                  <Button
                    className="h-11"
                    disabled={!readyChatModels.length}
                    title={
                      readyChatModels.length
                        ? undefined
                        : "Register or inherit a validated text generation model first."
                    }
                    onClick={() => setCreateOpen(true)}
                  >
                    <Plus />
                    Create Routing
                  </Button>
                ) : null}
              </div>
            </div>

            {routings.isPending ? (
              <LoadingState label="Loading routing…" />
            ) : routings.error ? (
              <ErrorState
                message={routings.error.message}
                onRetry={() => void routings.refetch()}
              />
            ) : routingItems.length ? (
              <>
                {!defaultRouting ? (
                  <div
                    role="alert"
                    className="flex gap-3 border-y border-amber-500/20 bg-amber-500/5 px-5 py-4 text-sm"
                  >
                    <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-700" />
                    <span>
                      <strong className="block">No default routing</strong>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        New Instances cannot receive model access until a Ready
                        routing is selected.
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
                <RoutingTable
                  canReconcile={canReconcileRouting}
                  canUpdate={canUpdateRouting}
                  routings={routingItems}
                  {...(refresh.isPending && refresh.variables
                    ? { refreshingId: refresh.variables }
                    : {})}
                  {...(setDefault.isPending && setDefault.variables?.id
                    ? { selectingId: setDefault.variables.id }
                    : {})}
                  onRefresh={(routing) => refresh.mutate(routing.id)}
                  onSelectDefault={(routing) => {
                    setSuccessMessage("");
                    setDefault.mutate(routing);
                  }}
                  {...(departmentManaged
                    ? { onConfigure: setEditingRouting }
                    : {})}
                  scopeLabel={scopeLabel}
                  {...(project ? { projectId: project.id } : {})}
                />
              </>
            ) : (
              <EmptyState
                icon={<Workflow className="size-4" />}
                title="No routing configured"
                description={
                  readyChatModels.length
                    ? "Create a fixed, complexity-aware, or semantic routing policy from registered models."
                    : "Register a validated text generation model before configuring routing."
                }
                action={
                  canCreateRouting ? (
                    <Button
                      className="mt-4 h-11"
                      onClick={() => {
                        if (readyChatModels.length) {
                          setCreateOpen(true);
                        } else {
                          onViewChange("models");
                        }
                      }}
                    >
                      <Plus />
                      {readyChatModels.length
                        ? "Create first routing"
                        : "View Models"}
                    </Button>
                  ) : null
                }
              />
            )}
        </section>
      )}

      <CreateModelRoutingSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        availableModels={models}
        defaultIsDefault={!defaultRouting}
        modelsLoading={deployments.isPending}
        {...(deployments.error?.message
          ? { modelsError: deployments.error.message }
          : {})}
        onRegisterModels={() => {
          setCreateOpen(false);
          onViewChange("models");
          openModelRegistration();
        }}
      />
      {removingModel ? (
        <DeleteEntitySheet
          open
          onOpenChange={(open) => {
            if (!open) setRemovingModel(undefined);
          }}
          title="Delete registered model"
          description={<>Remove <strong>{removingModel.displayName}</strong> from this {scopeLabel}.</>}
          entityName={removingModel.displayName}
          confirmLabel="Delete model"
          deleting={removeModel.isPending}
          onConfirm={() => removeModel.mutate(removingModel)}
          {...(removeModel.error instanceof Error ? { error: removeModel.error.message } : {})}
          retentionDescription="The registered model record is soft-deleted with a deletion timestamp. Its LiteLLM model registration is runtime configuration and is permanently removed."
        />
      ) : null}
      <RegisterModelsDrawer
        accounts={providerAccounts}
        initialAccount={registerAccount}
        initialMode={registrationMode}
        open={registerOpen}
        onOpenChange={setRegisterOpen}
      />
      {project ? (
        <DepartmentInheritanceSheet
          canAdd={view === "models" ? canRegisterModels : canCreateRouting}
          canRemove={view === "models" ? canDeleteModels : canDeleteRouting}
          open={inheritanceOpen}
          onOpenChange={setInheritanceOpen}
          view={view}
        />
      ) : null}
      {editingRouting ? (
        <DepartmentRoutingConfigurationSheet
          open
          routing={editingRouting}
          onOpenChange={(open) => {
            if (!open) setEditingRouting(undefined);
          }}
        />
      ) : null}
    </div>
  );
}

function DepartmentRoutingConfigurationSheet({
  onOpenChange,
  open,
  routing,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  routing: ModelRouting;
}) {
  const { client, key } = useInferenceManagement();
  const queryClient = useQueryClient();
  const [name, setName] = useState(routing.name);
  const [description, setDescription] = useState(routing.description);
  const [deleteOpen, setDeleteOpen] = useState(false);
  useEffect(() => {
    setName(routing.name);
    setDescription(routing.description);
  }, [routing]);
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: key("model-routings") });
  };
  const update = useMutation({
    mutationFn: () => client.updateModelRouting(routing.id, { name, description }),
    onSuccess: async () => {
      await invalidate();
      onOpenChange(false);
    },
  });
  const refresh = useMutation({
    mutationFn: () => client.refreshModelRouting(routing.id),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: () => client.deleteModelRouting(routing.id),
    onSuccess: async () => {
      await invalidate();
      setDeleteOpen(false);
      onOpenChange(false);
    },
  });
  const dirty = name.trim() !== routing.name || description.trim() !== routing.description;
  const canDelete = !routing.isDefault && routing.consumers === 0;

  return (
    <>
      <EntitySheet
        open={open}
        onOpenChange={(next) => !update.isPending && onOpenChange(next)}
        eyebrow="Department routing"
        title={routing.name}
        description="Manage the shared Routing identity. Saved changes are resolved live by every Project that inherits this Routing ID."
        footer={(
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              disabled={!dirty || name.trim().length < 2 || update.isPending}
              onClick={() => update.mutate()}
            >
              {update.isPending ? <Spinner /> : <Check />}
              Save changes
            </Button>
          </>
        )}
      >
        <div className="space-y-6">
          <div className="flex gap-3 border border-sky-500/20 bg-sky-500/5 p-3 text-xs leading-5 text-muted-foreground">
            <Building2 className="mt-0.5 size-4 shrink-0 text-sky-700" />
            Project references stay read-only and receive these changes automatically; no snapshot or version copy is created.
          </div>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="department-routing-name">Name</Label>
              <Input
                id="department-routing-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="department-routing-description">Description</Label>
              <Textarea
                id="department-routing-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
          </div>
          <dl className="grid gap-px overflow-hidden border bg-border sm:grid-cols-2">
            <div className="bg-background p-4">
              <dt className="text-xs text-muted-foreground">Public alias</dt>
              <dd className="mt-1 break-all font-mono text-xs font-semibold">{routing.publicModelAlias}</dd>
            </div>
            <div className="bg-background p-4">
              <dt className="text-xs text-muted-foreground">Routing strategy</dt>
              <dd className="mt-1 text-xs font-semibold">{routingSummary(routing).label}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap items-center justify-between gap-3 border-y py-4">
            <span>
              <strong className="block text-sm">Reconcile shared routing</strong>
              <span className="text-xs text-muted-foreground">Refresh readiness and LiteLLM desired state.</span>
            </span>
            <Button
              disabled={refresh.isPending}
              variant="outline"
              onClick={() => refresh.mutate()}
            >
              <RefreshCw className={cn(refresh.isPending && "animate-spin")} />
              Refresh
            </Button>
          </div>
          <div className="border border-destructive/25 p-4">
            <strong className="text-sm text-destructive">Danger zone</strong>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {routing.isDefault
                ? "Choose another Department default before deleting."
                : routing.consumers
                  ? `Reassign ${routing.consumers} active Instance${routing.consumers === 1 ? "" : "s"} before deleting.`
                  : "Deletion is blocked while any Project still inherits this Routing."}
            </p>
            <Button
              className="mt-3"
              disabled={!canDelete}
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 /> Delete routing
            </Button>
          </div>
          {update.error || refresh.error ? (
            <p className="border-l-2 border-destructive bg-destructive/5 p-3 text-sm text-destructive" role="alert">
              {(update.error ?? refresh.error)?.message}
            </p>
          ) : null}
        </div>
      </EntitySheet>
      {deleteOpen ? (
        <DeleteEntitySheet
          open
          onOpenChange={setDeleteOpen}
          title="Delete Department routing"
          description={<>Delete <strong>{routing.name}</strong> from this Department.</>}
          entityName={routing.name}
          confirmLabel="Delete routing"
          deleting={remove.isPending}
          onConfirm={() => remove.mutate()}
          {...(remove.error ? { error: remove.error.message } : {})}
          retentionDescription="The shared routing record is soft-deleted. Audit history remains retained."
        />
      ) : null}
    </>
  );
}

function DepartmentInheritanceSheet({
  canAdd,
  canRemove,
  onOpenChange,
  open,
  view,
}: {
  canAdd: boolean;
  canRemove: boolean;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  view: ManagementView;
}) {
  const { key } = useInferenceManagement();
  const queryClient = useQueryClient();
  const models = useQuery({
    queryKey: key("department-inheritable-models"),
    queryFn: api.listInheritableModels,
    enabled: open && view === "models",
  });
  const routings = useQuery({
    queryKey: key("department-inheritable-routings"),
    queryFn: api.listInheritableRoutings,
    enabled: open && view === "routing",
  });
  const mutation = useMutation({
    mutationFn: async ({ id, inherited }: { id: string; inherited: boolean }) => {
      if (view === "models") {
        return inherited
          ? api.removeDepartmentModelInheritance(id)
          : api.inheritDepartmentModel(id);
      }
      return inherited
        ? api.removeDepartmentRoutingInheritance(id)
        : api.inheritDepartmentRouting(id);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: key("model-deployments") }),
        queryClient.invalidateQueries({ queryKey: key("model-routings") }),
        queryClient.invalidateQueries({ queryKey: key("department-inheritable-models") }),
        queryClient.invalidateQueries({ queryKey: key("department-inheritable-routings") }),
      ]);
    },
  });
  const availability = view === "models" ? models.data : routings.data;
  const resources = view === "models"
    ? models.data?.models ?? []
    : routings.data?.routings ?? [];
  const pending = view === "models" ? models.isPending : routings.isPending;
  const queryError = view === "models" ? models.error : routings.error;

  return (
    <EntitySheet
      open={open}
      onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}
      eyebrow="Live inheritance"
      title={`Department ${view === "models" ? "models" : "routing"}`}
      description={(
        <>
          Reference resources from <strong>{availability?.departmentName ?? "the parent Department"}</strong> by ID.
          Inherited definitions stay read-only here and reflect Department updates automatically.
        </>
      )}
      footer={(
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Done
        </Button>
      )}
    >
      {view === "routing" ? (
        <div className="mb-4 flex gap-3 border border-sky-500/20 bg-sky-500/5 p-3 text-xs leading-5 text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0 text-sky-700" />
          Inheriting a Routing also links the Department models referenced by that Routing.
        </div>
      ) : null}
      {mutation.error ? (
        <p className="mb-4 border-l-2 border-destructive bg-destructive/5 p-3 text-sm text-destructive" role="alert">
          {mutation.error.message}
        </p>
      ) : null}
      {pending ? (
        <LoadingState label={`Loading Department ${view}…`} />
      ) : queryError ? (
        <ErrorState
          message={queryError.message}
          onRetry={() => void (view === "models" ? models.refetch() : routings.refetch())}
        />
      ) : resources.length ? (
        <div className="divide-y border-y">
          {resources.map((resource) => {
            const inherited = Boolean(resource.origin?.inherited);
            const actionAllowed = inherited ? canRemove : canAdd;
            const isPending = mutation.isPending && mutation.variables?.id === resource.id;
            const isModel = "modelType" in resource;
            return (
              <article className="flex items-start gap-4 py-4" key={resource.id}>
                <span className="grid size-9 shrink-0 place-items-center border text-muted-foreground">
                  {view === "models" ? <BrainCircuit /> : <Workflow />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-sm">
                      {isModel ? resource.displayName : resource.name}
                    </strong>
                    {inherited ? (
                      <Badge className="gap-1" variant="secondary">
                        <Check className="size-3" /> Inherited
                      </Badge>
                    ) : (
                      <Badge variant="outline">Available</Badge>
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {isModel
                      ? `${resource.providerName} · ${modelTypeLabels[resource.modelType]}`
                      : `${routingSummary(resource).label} · ${resource.publicModelAlias}`}
                  </p>
                </div>
                {actionAllowed ? (
                  <Button
                    disabled={isPending}
                    variant={inherited ? "outline" : "default"}
                    onClick={() => mutation.mutate({ id: resource.id, inherited })}
                  >
                    {isPending ? <Spinner /> : inherited ? <Trash2 /> : <Plus />}
                    {inherited ? "Remove" : "Inherit"}
                  </Button>
                ) : (
                  <Badge variant="outline">View only</Badge>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          action={null}
          icon={<Building2 className="size-4" />}
          title={`No Department ${view === "models" ? "models" : "routing"} available`}
          description="Ask a Department administrator to configure shared inference resources first."
        />
      )}
    </EntitySheet>
  );
}

function ModelTable({
  accounts,
  canDelete,
  models,
  onRemove,
  removingId,
  total,
  usage,
}: {
  accounts: ProviderAccount[];
  canDelete: boolean;
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
                    <span className="flex flex-wrap items-center gap-2">
                      <strong className="text-sm font-medium">
                        {model.displayName}
                      </strong>
                      <InheritedBadge resource={model} />
                    </span>
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
                    {useCount} Routing{useCount === 1 ? "" : "s"}
                  </td>
                  <td className="px-2 py-3">
                    {canDelete && model.origin?.editable !== false ? (
                      <Button
                        aria-label={`Remove ${model.displayName}`}
                        disabled={
                          removalBlocked || removingId === model.id
                        }
                        size="icon"
                        title={
                          removalBlocked
                            ? "Remove this model from its routing configurations first."
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
                  <span className="flex flex-wrap items-center gap-2">
                    <strong className="truncate text-sm font-medium">
                      {model.displayName}
                    </strong>
                    <InheritedBadge resource={model} />
                  </span>
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
                  Used by {useCount} Routing{useCount === 1 ? "" : "s"}
                </span>
                {canDelete && model.origin?.editable !== false ? (
                  <Button
                    aria-label={`Remove ${model.displayName}`}
                    disabled={useCount > 0 || removingId === model.id}
                    size="icon"
                    title={
                      useCount
                        ? "Remove this model from its routing configurations first."
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

function RoutingTable({
  canReconcile,
  canUpdate,
  onRefresh,
  onSelectDefault,
  onConfigure,
  routings,
  refreshingId,
  selectingId,
  projectId,
  scopeLabel,
}: {
  canReconcile: boolean;
  canUpdate: boolean;
  onRefresh: (routing: ModelRouting) => void;
  onSelectDefault: (routing: ModelRouting) => void;
  onConfigure?: (routing: ModelRouting) => void;
  routings: ModelRouting[];
  refreshingId?: string;
  selectingId?: string;
  projectId?: string;
  scopeLabel: "Project" | "Department";
}) {
  return (
    <div className="overflow-x-auto border-t">
      <table className="w-full min-w-[980px] text-left">
        <thead className="border-b bg-muted/20 text-xs text-muted-foreground">
          <tr>
            <th className="px-5 py-2.5 font-medium">Configuration</th>
            <th className="px-4 py-2.5 font-medium">Strategy</th>
            <th className="px-4 py-2.5 font-medium">Resilience</th>
            <th className="px-4 py-2.5 font-medium">Boundary</th>
            <th className="px-4 py-2.5 font-medium">Use</th>
            <th className="px-5 py-2.5 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {routings.map((routing) => (
            <RoutingRow
              key={routing.id}
              canReconcile={canReconcile}
              canUpdate={canUpdate}
              routing={routing}
              refreshing={refreshingId === routing.id}
              selecting={selectingId === routing.id}
              scopeLabel={scopeLabel}
              {...(projectId ? { projectId } : {})}
              onRefresh={() => onRefresh(routing)}
              onSelectDefault={() => onSelectDefault(routing)}
              {...(onConfigure ? { onConfigure: () => onConfigure(routing) } : {})}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RoutingRow({
  canReconcile,
  canUpdate,
  onRefresh,
  onSelectDefault,
  onConfigure,
  routing,
  refreshing,
  selecting,
  projectId,
  scopeLabel,
}: {
  canReconcile: boolean;
  canUpdate: boolean;
  onRefresh: () => void;
  onSelectDefault: () => void;
  onConfigure?: () => void;
  routing: ModelRouting;
  refreshing: boolean;
  selecting: boolean;
  projectId?: string;
  scopeLabel: "Project" | "Department";
}) {
  const summary = routingSummary(routing);
  const fallbackCount =
    routing.routingPolicy.fallbackModelDeploymentIds.length;
  const retries = routing.routingPolicy.retries;
  const canBecomeDefault =
    canUpdate && routing.status === "READY" && !routing.isDefault;
  const editable = routing.origin?.editable !== false;
  return (
    <tr className={cn(routing.isDefault && "bg-primary/[0.025]")}>
      <td className="px-5 py-3">
        <span className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              "mt-0.5 grid size-8 shrink-0 place-items-center rounded-md border",
              routing.isDefault
                ? "border-primary/25 bg-primary/10 text-primary"
                : "text-muted-foreground",
            )}
          >
            {routing.isDefault
              ? <Check className="size-4" />
              : <Workflow className="size-4" />}
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <strong className="text-sm">{routing.name}</strong>
              <GatewaySyncStatus
                compact
                message={routing.validationMessage}
                status={routing.status}
              />
              {routing.isDefault ? (
                <Badge variant="secondary">{scopeLabel} default</Badge>
              ) : null}
              <InheritedBadge resource={routing} />
            </span>
            <span className="mt-1 block max-w-xs truncate text-[11px] text-muted-foreground">
              {routing.description || routing.publicModelAlias}
            </span>
          </span>
        </span>
      </td>
      <td className="px-4 py-3">
        <strong className="block text-xs font-medium">{summary.label}</strong>
        <span className="mt-0.5 block text-[11px] text-muted-foreground">
          {summary.detail}
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
        <Boundary domain={routing.complianceDomain} />
      </td>
      <td className="px-4 py-3">
        <span className="block text-xs text-muted-foreground">
          {routing.consumers} active Instance
          {routing.consumers === 1 ? "" : "s"}
        </span>
      </td>
      <td className="px-5 py-3">
        <div className="flex items-center justify-end gap-1">
          {canReconcile && editable ? (
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Refresh ${routing.name}`}
              disabled={refreshing}
              onClick={onRefresh}
            >
              <RefreshCw className={cn(refreshing && "animate-spin")} />
            </Button>
          ) : null}
          {!routing.isDefault && canUpdate ? (
            <Button
              variant="outline"
              disabled={!canBecomeDefault || selecting}
              title={
                canBecomeDefault
                  ? undefined
                  : `Only ready routing can become the ${scopeLabel} default.`
              }
              onClick={onSelectDefault}
            >
              {selecting ? <Spinner /> : <Check />}
              Set default
            </Button>
          ) : null}
          {editable && projectId ? (
            <Button asChild variant="ghost">
              <a href={`/${encodeURIComponent(projectId)}/setting/model-routings/${encodeURIComponent(routing.id)}`}>
                Configure
                <ArrowRight />
              </a>
            </Button>
          ) : editable && onConfigure ? (
            <Button variant="ghost" onClick={onConfigure}>
              Configure
              <ArrowRight />
            </Button>
          ) : !editable ? (
            <Button
              disabled
              title="Inherited Department Routing is updated at the Department level."
              variant="ghost"
            >
              <LockKeyhole />
              Read only
            </Button>
          ) : null}
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

function InheritedBadge({
  resource,
}: {
  resource: {
    origin?: {
      inherited: boolean;
      scopeName?: string;
    };
  };
}) {
  if (!resource.origin?.inherited) return null;
  return (
    <Badge
      className="gap-1 border-sky-500/20 bg-sky-500/8 text-sky-800"
      title="Referenced by ID. Department updates apply automatically."
      variant="outline"
    >
      <Building2 className="size-3" />
      Inherited from {resource.origin.scopeName ?? "Department"}
    </Badge>
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

function routingSummary(routing: ModelRouting): {
  label: string;
  detail: string;
} {
  if (routing.routingPolicy.mode === "SINGLE") {
    return { label: "Fixed model", detail: "One primary model" };
  }
  if (routing.routingPolicy.mode === "COMPLEXITY") {
    return {
      label: "By complexity",
      detail: "SIMPLE / MEDIUM · COMPLEX / REASONING",
    };
  }
  return {
    label: "By intent",
    detail: `${routing.routingPolicy.routes.length} semantic intent${
      routing.routingPolicy.routes.length === 1 ? "" : "s"
    }`,
  };
}

function deploymentIds(routing: ModelRouting): Set<string> {
  const policy = routing.routingPolicy;
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
