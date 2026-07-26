import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ComplianceDomain,
  ModelDeployment,
  ModelProfileRoutingPolicy,
} from "@tasklattice/contracts";
import {
  Activity,
  Check,
  CircleAlert,
  KeyRound,
  ShieldCheck,
} from "lucide-react";
import { EntitySheet } from "@/components/shared/entity-sheet";
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
  const [routingMode, setRoutingMode] = useState<
    "single" | "complexity" | "external"
  >("single");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [complexModelId, setComplexModelId] = useState("");
  const [fallbackModelId, setFallbackModelId] = useState("none");
  const [retries, setRetries] = useState("2");
  const [alias, setAlias] = useState("");
  const [externalDomain, setExternalDomain] =
    useState<ComplianceDomain>("GLOBAL");
  const [makeDefault, setMakeDefault] = useState(defaultIsDefault);
  const [attempted, setAttempted] = useState(false);
  const gateway = gateways.data?.[0];
  const compatibleModels = useMemo(
    () =>
      availableModels.filter(
        (model) =>
          model.status === "VALIDATED" && model.modelType === "llm",
      ),
    [availableModels],
  );
  const selectedModel = compatibleModels.find(
    (model) => model.id === selectedModelId,
  );
  const sameDomainModels = compatibleModels.filter(
    (model) => model.complianceDomain === selectedModel?.complianceDomain,
  );
  const complexModel = sameDomainModels.find(
    (model) => model.id === complexModelId,
  );
  const fallbackModel = sameDomainModels.find(
    (model) => model.id === fallbackModelId,
  );
  const routingPolicy: ModelProfileRoutingPolicy | undefined =
    routingMode === "single" && selectedModel
      ? {
          version: 1,
          mode: "SINGLE",
          modelDeploymentId: selectedModel.id,
        }
      : routingMode === "complexity" && selectedModel && complexModel
        ? {
            version: 1,
            mode: "COMPLEXITY",
            simpleModelDeploymentId: selectedModel.id,
            complexModelDeploymentId: complexModel.id,
            ...(fallbackModel
              ? { fallbackModelDeploymentId: fallbackModel.id }
              : {}),
            retries: Number(retries),
          }
        : routingMode === "external" && alias.trim()
          ? {
              version: 1,
              mode: "EXTERNAL",
              alias: alias.trim(),
            }
          : undefined;

  useEffect(() => {
    if (!open) return;
    setRoutingMode("single");
    setSelectedModelId("");
    setComplexModelId("");
    setFallbackModelId("none");
    setRetries("2");
    setAlias("");
    setExternalDomain("GLOBAL");
    setMakeDefault(defaultIsDefault);
    setAttempted(false);
  }, [defaultIsDefault, open]);

  useEffect(() => {
    if (
      !open ||
      routingMode === "external" ||
      selectedModelId ||
      !compatibleModels.length
    )
      return;
    setSelectedModelId(
      (compatibleModels.find((model) => model.isDefault) ??
        compatibleModels[0])!.id,
    );
  }, [compatibleModels, open, routingMode, selectedModelId]);

  useEffect(() => {
    if (routingMode !== "complexity" || !selectedModel) return;
    if (!sameDomainModels.some((model) => model.id === complexModelId)) {
      setComplexModelId(
        sameDomainModels.find((model) => model.id !== selectedModel.id)?.id ?? "",
      );
    }
    if (
      fallbackModelId !== "none"
      && (
        !sameDomainModels.some((model) => model.id === fallbackModelId)
        || fallbackModelId === selectedModel.id
        || fallbackModelId === complexModelId
      )
    ) {
      setFallbackModelId("none");
    }
  }, [
    complexModelId,
    fallbackModelId,
    routingMode,
    sameDomainModels,
    selectedModel,
  ]);

  const mutation = useMutation({
    mutationFn: () =>
      api.createModelProfile({
        name,
        description,
        gatewayId: gateway?.id ?? "",
        routingPolicy: routingPolicy!,
        complianceDomain:
          routingMode === "external"
            ? externalDomain
            : selectedModel?.complianceDomain ?? "GLOBAL",
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
      setComplexModelId("");
      setFallbackModelId("none");
      setAlias("");
      setAttempted(false);
      onOpenChange(false);
    },
  });
  const nameValid = name.trim().length >= 2;
  const modelValid = Boolean(routingPolicy);
  const gatewayAvailable = Boolean(gateways.data?.length);
  const submit = () => {
    setAttempted(true);
    if (!nameValid || !modelValid || !gatewayAvailable) return;
    mutation.mutate();
  };

  return (
    <EntitySheet
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
              (routingMode !== "external" && modelsLoading)
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
            title="Routing policy"
            description="Choose a direct model or let LiteLLM route by request complexity."
          />
          <div
            role="radiogroup"
            aria-label="Routing mode"
            className="grid gap-2 sm:grid-cols-3"
          >
            {([
              ["single", "Single model", "Every request uses one model."],
              [
                "complexity",
                "Complexity routing",
                "Simple and complex requests use different models.",
              ],
              [
                "external",
                "Existing LiteLLM alias",
                "Attach a router managed outside TaskLattice.",
              ],
            ] as const).map(([value, label, help]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={routingMode === value}
                className={cn(
                  "min-h-20 border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-primary",
                  routingMode === value
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted/40",
                )}
                onClick={() => {
                  setRoutingMode(value);
                  setAttempted(false);
                }}
              >
                <strong className="block text-sm font-medium">{label}</strong>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  {help}
                </span>
              </button>
            ))}
          </div>

          {routingMode === "single" ? (
            <div className="grid items-start gap-4 sm:grid-cols-2">
              <Field
                label="Model"
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
              <GatewayField
                loading={gateways.isPending}
                name={gateway?.name}
                available={gatewayAvailable}
              />
            </div>
          ) : routingMode === "complexity" ? (
            <>
              <div className="grid items-start gap-4 sm:grid-cols-2">
                <Field
                  label="Simple requests"
                  htmlFor="profile-simple-model"
                  help={
                    selectedModel
                      ? `${selectedModel.providerName} · ${selectedModel.complianceDomain === "CN_MAINLAND" ? "CN Mainland" : "Global"}`
                      : "Used for SIMPLE and MEDIUM requests."
                  }
                  invalid={attempted && !selectedModel}
                >
                  <Select
                    value={selectedModelId}
                    disabled={modelsLoading || !compatibleModels.length}
                    onValueChange={setSelectedModelId}
                  >
                    <SelectTrigger
                      id="profile-simple-model"
                      aria-label="Simple request model"
                      aria-invalid={attempted && !selectedModel}
                    >
                      <SelectValue placeholder="Choose a cost-efficient model" />
                    </SelectTrigger>
                    <SelectContent>
                      {compatibleModels.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.displayName} · {model.providerName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field
                  label="Complex requests"
                  htmlFor="profile-complex-model"
                  help={
                    attempted && !complexModel
                      ? "Choose a different model in the same compliance domain."
                      : "Used for COMPLEX and REASONING requests."
                  }
                  invalid={attempted && !complexModel}
                >
                  <Select
                    value={complexModelId}
                    disabled={!selectedModel || sameDomainModels.length < 2}
                    onValueChange={setComplexModelId}
                  >
                    <SelectTrigger
                      id="profile-complex-model"
                      aria-label="Complex request model"
                      aria-invalid={attempted && !complexModel}
                    >
                      <SelectValue placeholder="Choose a stronger model" />
                    </SelectTrigger>
                    <SelectContent>
                      {sameDomainModels
                        .filter((model) => model.id !== selectedModel?.id)
                        .map((model) => (
                          <SelectItem key={model.id} value={model.id}>
                            {model.displayName} · {model.providerName}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field
                  label="Fallback"
                  htmlFor="profile-fallback-model"
                  help="Optional. Used only after the routed request exhausts retries."
                >
                  <Select
                    value={fallbackModelId}
                    disabled={!complexModel}
                    onValueChange={setFallbackModelId}
                  >
                    <SelectTrigger
                      id="profile-fallback-model"
                      aria-label="Fallback model"
                    >
                      <SelectValue placeholder="No fallback" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No fallback</SelectItem>
                      {sameDomainModels
                        .filter(
                          (model) =>
                            model.id !== selectedModel?.id
                            && model.id !== complexModel?.id,
                        )
                        .map((model) => (
                          <SelectItem key={model.id} value={model.id}>
                            {model.displayName} · {model.providerName}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field
                  label="Retries"
                  htmlFor="profile-retries"
                  help="Per-request retries before LiteLLM invokes the fallback."
                >
                  <Select value={retries} onValueChange={setRetries}>
                    <SelectTrigger id="profile-retries" aria-label="Retries">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[0, 1, 2, 3, 4, 5].map((value) => (
                        <SelectItem key={value} value={String(value)}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="grid gap-px border bg-border text-xs sm:grid-cols-3">
                <ModelFact
                  label="Tier mapping"
                  value="SIMPLE / MEDIUM → simple"
                />
                <ModelFact
                  label="Tier mapping"
                  value="COMPLEX / REASONING → complex"
                />
                <ModelFact
                  label="Public identity"
                  value="Generated stable alias"
                />
              </div>
              <GatewayField
                loading={gateways.isPending}
                name={gateway?.name}
                available={gatewayAvailable}
              />
            </>
          ) : (
            <div className="grid items-start gap-4 sm:grid-cols-2">
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
              <Field
                label="Compliance boundary"
                htmlFor="profile-external-domain"
                help="Every effective candidate must declare this domain in LiteLLM."
              >
                <Select
                  value={externalDomain}
                  onValueChange={(value) =>
                    setExternalDomain(value as ComplianceDomain)
                  }
                >
                  <SelectTrigger
                    id="profile-external-domain"
                    aria-label="External alias compliance boundary"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GLOBAL">Global</SelectItem>
                    <SelectItem value="CN_MAINLAND">CN Mainland</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <GatewayField
                loading={gateways.isPending}
                name={gateway?.name}
                available={gatewayAvailable}
              />
            </div>
          )}

          {selectedModel && routingMode === "single" ? (
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

          {modelsError && routingMode !== "external" ? (
            <p
              role="alert"
              className="border-l-2 border-destructive bg-destructive/5 p-3 text-xs text-destructive"
            >
              {modelsError}
            </p>
          ) : null}

          {!modelsLoading &&
          !compatibleModels.length &&
          routingMode !== "external" ? (
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
                routingMode === "external"
                  ? externalDomain === "CN_MAINLAND"
                    ? "CN Mainland"
                    : "Global"
                  : selectedModel?.complianceDomain === "CN_MAINLAND"
                  ? "CN Mainland"
                  : selectedModel?.complianceDomain === "GLOBAL"
                    ? "Global"
                    : "Choose a model"
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
    </EntitySheet>
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

function GatewayField({
  available,
  loading,
  name,
}: {
  available: boolean;
  loading: boolean;
  name: string | undefined;
}) {
  return (
    <Field
      label="Gateway"
      help={
        available
          ? "LiteLLM management and inference boundary."
          : "A Gateway is required before this profile can be created."
      }
      invalid={!loading && !available}
    >
      <div className="flex h-11 items-center border bg-muted/30 px-3 text-sm">
        {loading ? "Loading…" : (name ?? "Unavailable")}
      </div>
    </Field>
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
