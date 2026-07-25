import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ModelDeployment } from "@tasklattice/contracts";
import {
  Activity,
  Check,
  CircleAlert,
  KeyRound,
  ShieldCheck,
} from "lucide-react";
import { EntityFormSheet } from "@/components/shared/entity-form-sheet";
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
import { Textarea } from "@/components/ui/textarea";
import { useProjectQueryScope } from "@/hooks/use-project-query-scope";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export function CreateModelProfileSheet({
  availableModels,
  defaultIsDefault,
  modelsError,
  modelsLoading,
  onAddUpstream,
  onOpenChange,
  open,
}: {
  availableModels: ModelDeployment[];
  defaultIsDefault: boolean;
  modelsError?: string;
  modelsLoading: boolean;
  onAddUpstream: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const queryClient = useQueryClient();
  const scope = useProjectQueryScope();
  const gateways = useQuery({
    queryKey: scope.key("inference-gateways"),
    queryFn: api.listInferenceGateways,
    enabled: open,
  });
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [modelSource, setModelSource] = useState<"catalog" | "custom">(
    "catalog",
  );
  const [selectedModelId, setSelectedModelId] = useState("");
  const [alias, setAlias] = useState("");
  const [makeDefault, setMakeDefault] = useState(defaultIsDefault);
  const [attempted, setAttempted] = useState(false);
  const gateway = gateways.data?.[0];
  const compatibleModels = useMemo(
    () =>
      availableModels.filter(
        (model) =>
          model.status === "VALIDATED",
      ),
    [availableModels, gateway],
  );
  const selectedModel = compatibleModels.find(
    (model) => model.id === selectedModelId,
  );
  const publicModelAlias =
    modelSource === "catalog"
      ? (selectedModel?.litellmModelName ?? "")
      : alias.trim();

  useEffect(() => {
    if (!open) return;
    setModelSource("catalog");
    setSelectedModelId("");
    setAlias("");
    setMakeDefault(defaultIsDefault);
    setAttempted(false);
  }, [defaultIsDefault, open]);

  useEffect(() => {
    if (
      !open ||
      modelSource !== "catalog" ||
      selectedModelId ||
      !compatibleModels.length
    )
      return;
    setSelectedModelId(
      (compatibleModels.find((model) => model.isDefault) ??
        compatibleModels[0])!.id,
    );
  }, [compatibleModels, modelSource, open, selectedModelId]);

  const mutation = useMutation({
    mutationFn: () =>
      api.createModelProfile({
        name,
        description,
        gatewayId: gateway?.id ?? "",
        publicModelAlias,
        complianceDomain: selectedModel?.complianceDomain ?? "GLOBAL",
        isDefault: makeDefault,
        keyPolicy: { perInstance: true, rotationDays: 90 },
        auditPolicy: {
          controlPlane: true,
          requestLogs: true,
          capturePrompts: false,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: scope.key("model-profiles"),
      });
      setName("");
      setDescription("");
      setSelectedModelId("");
      setAlias("");
      setAttempted(false);
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

  return (
    <EntityFormSheet
      open={open}
      onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}
      eyebrow="Model Profile"
      title="Create Model Profile"
      description="Choose the model Instances will use, then apply a stable access and policy boundary around it."
      width="lg"
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            className="min-w-48"
            disabled={
              mutation.isPending ||
              gateways.isPending ||
              !gatewayAvailable ||
              (modelSource === "catalog" && modelsLoading)
            }
            onClick={submit}
          >
            {mutation.isPending
              ? "Validating profile…"
              : "Create and validate profile"}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <section className="space-y-4">
          <SectionTitle
            number="01"
            title="Profile identity"
            description="What operators see when choosing a model."
          />
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <Field
              label="Profile name"
              htmlFor="profile-name"
              help={
                attempted && !nameValid
                  ? "Enter at least 2 characters."
                  : "Use a workload or policy-oriented name."
              }
              invalid={attempted && !nameValid}
            >
              <Input
                id="profile-name"
                value={name}
                aria-invalid={attempted && !nameValid}
                onChange={(event) => setName(event.target.value)}
                placeholder="Production reasoning"
              />
            </Field>
            <Field
              label="Description"
              htmlFor="profile-description"
              help="Optional context for profile consumers."
            >
              <Textarea
                id="profile-description"
                className="min-h-20"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Balanced reasoning for production Agents"
              />
            </Field>
          </div>
        </section>

        <section className="space-y-4 border-t pt-5">
          <SectionTitle
            number="02"
            title="Model selection"
            description="Choose a validated model from the current upstream pool."
          />
          <div className="grid items-start gap-4 sm:grid-cols-2">
            {modelSource === "catalog" ? (
              <Field
                label="Available model"
                htmlFor="profile-model"
                help={
                  attempted && !modelValid
                    ? "Choose a model before creating this profile."
                    : selectedModel
                      ? `${selectedModel.providerName} · ${modelTypeLabel(selectedModel.modelType)} · ${selectedModel.complianceDomain === "CN_MAINLAND" ? "CN Mainland" : "Global"}`
                      : modelsLoading
                        ? "Loading validated models…"
                        : "Only validated, compliance-compatible models are shown."
                }
                invalid={attempted && !modelValid}
              >
                <Select
                  value={selectedModelId}
                  disabled={modelsLoading || !compatibleModels.length}
                  onValueChange={setSelectedModelId}
                >
                  <SelectTrigger
                    id="profile-model"
                    aria-label="Available model"
                    aria-invalid={attempted && !modelValid}
                  >
                    <SelectValue
                      placeholder={
                        modelsLoading
                          ? "Loading models…"
                          : compatibleModels.length
                            ? "Choose a model"
                            : "No compatible models"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {compatibleModels.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.displayName} · {model.providerName}
                        {model.isDefault ? " · Default" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : (
              <Field
                label="Existing router alias"
                htmlFor="profile-alias"
                help={
                  attempted && !modelValid
                    ? "Enter an existing LiteLLM router alias."
                    : "Use this only when routing is already configured outside TaskLattice."
                }
                invalid={attempted && !modelValid}
              >
                <Input
                  id="profile-alias"
                  value={alias}
                  aria-invalid={attempted && !modelValid}
                  onChange={(event) => setAlias(event.target.value)}
                  placeholder="production-reasoning"
                />
              </Field>
            )}
            <Field
              label="Gateway"
              help={
                gatewayAvailable
                  ? "Platform-managed routing boundary."
                  : "A Gateway is required before this profile can be created."
              }
              invalid={!gateways.isPending && !gatewayAvailable}
            >
              <div className="flex h-11 items-center border bg-muted/30 px-3 text-sm">
                {gateways.isPending ? "Loading…" : (gateway?.name ?? "Unavailable")}
              </div>
            </Field>
          </div>

          {selectedModel && modelSource === "catalog" ? (
            <div className="grid gap-px border bg-border text-xs sm:grid-cols-3">
              <ModelFact
                label="Provider model"
                value={selectedModel.modelId}
                mono
              />
              <ModelFact
                label="Gateway model name"
                value={selectedModel.litellmModelName}
                mono
              />
              <ModelFact label="Validation" value="Ready" />
            </div>
          ) : null}

          {modelsError && modelSource === "catalog" ? (
            <p
              role="alert"
              className="border-l-2 border-destructive bg-destructive/5 p-3 text-xs text-destructive"
            >
              {modelsError}
            </p>
          ) : null}

          {!modelsLoading &&
          !compatibleModels.length &&
          modelSource === "catalog" ? (
            <div className="flex flex-col gap-3 border-l-2 border-amber-500 bg-amber-500/5 p-3 text-xs leading-5 sm:flex-row sm:items-center sm:justify-between">
              <span className="flex gap-2">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-700" />
                {availableModels.some(
                  (model) => model.status === "VALIDATED",
                )
                  ? "No validated model is available for this profile."
                  : "No validated upstream model is available yet."}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onAddUpstream}
              >
                Add upstream
              </Button>
            </div>
          ) : null}

          <button
            type="button"
            className="min-h-11 text-left text-xs font-medium text-primary underline underline-offset-4 focus-visible:outline-2"
            onClick={() => {
              setModelSource((current) =>
                current === "catalog" ? "custom" : "catalog",
              );
              setAttempted(false);
            }}
          >
            {modelSource === "catalog"
              ? "Use an existing LiteLLM router alias instead"
              : "Choose from registered models"}
          </button>
        </section>

        <section className="space-y-4 border-t pt-5">
          <SectionTitle
            number="03"
            title="Access & guardrails"
            description="Policies applied whenever an Instance consumes this profile."
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <PolicyFact
              icon={ShieldCheck}
              label="Compliance"
              value={
                selectedModel?.complianceDomain === "CN_MAINLAND"
                  ? "CN Mainland"
                  : selectedModel?.complianceDomain === "GLOBAL"
                    ? "Global"
                    : "From LiteLLM metadata"
              }
            />
            <PolicyFact
              icon={KeyRound}
              label="Credentials"
              value="Isolated per Instance"
            />
            <PolicyFact
              icon={Activity}
              label="Audit"
              value="Control plane + requests"
            />
          </div>
          <button
            type="button"
            aria-pressed={makeDefault}
            className={cn(
              "flex min-h-11 w-full items-center gap-3 border px-3 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary",
              makeDefault && "border-primary bg-primary/5",
            )}
            onClick={() => setMakeDefault((value) => !value)}
          >
            <span
              className={cn(
                "grid size-5 shrink-0 place-items-center border",
                makeDefault &&
                  "border-primary bg-primary text-primary-foreground",
              )}
            >
              <Check className="size-3.5" />
            </span>
            <span>
              <strong className="block font-medium">
                Default Model Profile
              </strong>
              <span className="text-xs text-muted-foreground">
                Automatically selected for new Instances in this Project.
              </span>
            </span>
          </button>
        </section>

        {mutation.error ? (
          <p role="alert" className="flex gap-2 text-xs text-destructive">
            <CircleAlert className="size-4" />
            {mutation.error.message}
          </p>
        ) : null}
      </div>
    </EntityFormSheet>
  );
}

function SectionTitle({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-3">
      <span className="font-mono text-xs text-primary">{number}</span>
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function Field({
  children,
  help,
  htmlFor,
  invalid,
  label,
}: {
  children: ReactNode;
  help: string;
  htmlFor?: string;
  invalid?: boolean;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      <p
        className={cn(
          "min-h-5 text-xs leading-5",
          invalid ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {help}
      </p>
    </div>
  );
}

function PolicyFact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ShieldCheck;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-h-20 gap-3 border p-3">
      <Icon className="size-4 shrink-0 text-primary" />
      <span>
        <span className="block text-xs text-muted-foreground">{label}</span>
        <strong className="mt-1 block text-xs font-medium">{value}</strong>
      </span>
    </div>
  );
}

function ModelFact({
  label,
  mono = false,
  value,
}: {
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <div className="min-w-0 bg-background p-3">
      <span className="block text-muted-foreground">{label}</span>
      <strong
        className={cn(
          "mt-1 block truncate font-medium",
          mono && "font-mono",
        )}
        title={value}
      >
        {value}
      </strong>
    </div>
  );
}

function modelTypeLabel(type: ModelDeployment["modelType"]) {
  return type === "llm"
    ? "Language model"
    : type === "text-embedding"
      ? "Embedding"
      : "Speech to text";
}
