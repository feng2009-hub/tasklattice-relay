import { randomUUID } from "node:crypto";
import {
  providerPresets,
  type CreateModelDeploymentInput,
  type CreateProviderAccountInput,
  type CreateProviderConnectionInput,
  type ModelDeployment,
  type ProviderAccount,
  type ProviderConnectionCreationResult,
  type ProviderConnectionDraft,
  type ProviderDiscoveryResult,
  type ProviderKind,
  type ProviderModelSelection,
  type ProviderPresetId,
  type ProviderValidationCheck,
} from "@tasklattice/contracts";
import { AgentStore } from "../data/agent-store";
import { providerAdapter } from "./provider-adapters";
import { LiteLLMClient, type LiteLLMAdminClient } from "./litellm-client";
import type { ProviderValidator } from "./provider-validator";

interface StoredProviderCredential {
  version: 1;
  provider: ProviderKind;
  config: Record<string, unknown>;
  credentials: Record<string, unknown>;
}

const validationChecks = (
  discovery: ProviderDiscoveryResult,
  hasFailures: boolean,
): ProviderValidationCheck[] => [
  { id: "endpoint", label: "Endpoint reachability", status: "PASS" },
  { id: "credentials", label: "Credential authorization", status: "PASS" },
  {
    id: "catalog",
    label: discovery.mode === "remote" ? "Model catalog discovery" : "Manual or curated model catalog",
    status: discovery.mode === "remote" ? "PASS" : "SKIP",
  },
  { id: "inference", label: "LiteLLM model capability probe", status: hasFailures ? "FAIL" : "PASS" },
];

const modelChecks = (status: "PASS" | "FAIL"): ProviderValidationCheck[] => [
  { id: "endpoint", label: "Endpoint reachability", status },
  { id: "credentials", label: "Credential authorization", status },
  { id: "catalog", label: "Model registration", status },
  { id: "inference", label: "LiteLLM model capability probe", status },
];

function catalog(kind: ProviderKind) {
  const item = providerPresets.find((candidate) => candidate.id === kind);
  if (!item) throw new Error(`Provider catalog entry ${kind} was not found.`);
  return item;
}

function encodeCredential(draft: ProviderConnectionDraft): string {
  return JSON.stringify({
    version: 1,
    provider: draft.provider,
    config: draft.config,
    credentials: draft.credentials,
  } satisfies StoredProviderCredential);
}

function legacyKind(presetId: ProviderPresetId): ProviderKind {
  if (presetId === "kimi-cn" || presetId === "kimi-global") return "moonshot";
  return presetId;
}

function legacyDraft(account: ProviderAccount, rawCredential: string): ProviderConnectionDraft {
  const kind = legacyKind(account.presetId);
  if (kind === "moonshot")
    return {
      provider: "moonshot",
      name: account.name,
      config: {
        region: account.presetId === "kimi-global" ? "global" : "cn",
        endpoint: account.endpoint,
      },
      credentials: { apiKey: rawCredential },
    };
  return {
    provider: kind,
    name: account.name,
    config: { endpoint: account.endpoint },
    credentials: { apiKey: rawCredential },
  } as ProviderConnectionDraft;
}

function decodeCredential(account: ProviderAccount, rawCredential: string): ProviderConnectionDraft {
  try {
    const stored = JSON.parse(rawCredential) as Partial<StoredProviderCredential>;
    if (
      stored.version === 1 &&
      stored.provider &&
      stored.config &&
      stored.credentials
    )
      return {
        provider: stored.provider,
        name: account.name,
        config: stored.config,
        credentials: stored.credentials,
      } as ProviderConnectionDraft;
  } catch {
    // Existing installations store a single API key in this column.
  }
  return legacyDraft(account, rawCredential);
}

function toModelSelection(input: CreateModelDeploymentInput): ProviderModelSelection {
  const { providerAccountId: _providerAccountId, ...model } = input;
  return model;
}

export class ProviderService {
  constructor(
    readonly store = new AgentStore(),
    readonly legacyValidator?: ProviderValidator,
    readonly litellm: LiteLLMAdminClient = new LiteLLMClient(),
  ) {}

  listAccounts(): ProviderAccount[] {
    return this.store.listProviderAccounts();
  }

  listModels(providerAccountId?: string): ModelDeployment[] {
    return this.store.listModelDeployments(providerAccountId);
  }

  discover(draft: ProviderConnectionDraft): Promise<ProviderDiscoveryResult> {
    return providerAdapter(draft.provider).discover(draft);
  }

  async createConnection(input: CreateProviderConnectionInput): Promise<ProviderConnectionCreationResult> {
    const discovery = await this.discover(input.connection);
    return this.createConnectionWithDiscovery(input, discovery);
  }

  /** Compatibility path for existing API callers while the UI moves to the wizard contract. */
  async registerAccount(input: CreateProviderAccountInput): Promise<ProviderAccount> {
    const provider = legacyKind(input.presetId);
    const draft = legacyDraft({
      id: "legacy-draft",
      name: input.name,
      providerKind: provider,
      presetId: input.presetId,
      endpoint: input.endpoint,
      config: { endpoint: input.endpoint },
      discoveredModels: [],
      status: "FAILED",
      checks: [],
      credentialState: "STORED",
      validationMessage: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, input.apiKey);
    const item = catalog(provider);
    const discovery = this.legacyValidator
      ? await this.legacyValidator.validateConnection(input.endpoint, input.apiKey).then((result) => ({
          providerKind: provider,
          mode: "remote" as const,
          models: result.models.map((modelId) =>
            item.defaultModels.find((model) => model.modelId === modelId) ?? {
              modelId,
              displayName: modelId,
              modelType: "llm" as const,
            },
          ),
          checks: result.checks,
          message: result.message,
          latencyMs: result.latencyMs,
        }))
      : await this.discover(draft);
    const available = new Set(discovery.models.map((model) => model.modelId));
    const models = item.defaultModels.filter((model) =>
      discovery.mode !== "remote" || available.has(model.modelId),
    );
    if (!models.length) throw new Error("Select at least one model before creating a Provider connection.");
    return (await this.createConnectionWithDiscovery({ connection: draft, models: [...models] }, discovery)).account;
  }

  async revalidateAccount(id: string): Promise<ProviderAccount | undefined> {
    const account = this.store.getProviderAccount(id);
    const rawCredential = this.store.getProviderAccountCredential(id);
    if (!account || !rawCredential) return undefined;
    const draft = decodeCredential(account, rawCredential);
    const discovery = await this.discover(draft);
    const models = this.store.listModelDeployments(id);
    let passed = 0;
    for (const model of models) {
      try {
        await this.litellm.probeModel(model.litellmModelName, model.modelType);
        passed += 1;
        this.store.saveModelDeployment({
          ...model,
          status: "VALIDATED",
          checks: modelChecks("PASS"),
          validationMessage: `${model.modelId} passed the LiteLLM capability probe.`,
          validatedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      } catch (error) {
        this.store.saveModelDeployment({
          ...model,
          status: "FAILED",
          checks: modelChecks("FAIL"),
          validationMessage: error instanceof Error ? error.message : "Model validation failed.",
          updatedAt: new Date().toISOString(),
        });
      }
    }
    const status = models.length === 0
      ? discovery.checks.some((check) => check.status === "FAIL") ? "FAILED" : "VALIDATED"
      : passed === models.length ? "VALIDATED" : passed > 0 ? "DEGRADED" : "FAILED";
    const updated = {
      ...account,
      providerKind: draft.provider,
      config: draft.config,
      endpoint: providerAdapter(draft.provider).endpoint(draft),
      discoveredModels: [...new Set([
        ...discovery.models.map((model) => model.modelId),
        ...models.map((model) => model.modelId),
      ])],
      status,
      checks: validationChecks(discovery, status !== "VALIDATED"),
      validationMessage: models.length
        ? `${passed} of ${models.length} registered models passed revalidation.`
        : discovery.message,
      ...(discovery.latencyMs !== undefined ? { validationLatencyMs: discovery.latencyMs } : {}),
      ...(passed > 0 || models.length === 0
        ? { validatedAt: new Date().toISOString() }
        : account.validatedAt ? { validatedAt: account.validatedAt } : {}),
      updatedAt: new Date().toISOString(),
    } satisfies ProviderAccount;
    return this.store.saveProviderAccount(updated);
  }

  async deleteAccount(id: string): Promise<boolean> {
    const account = this.store.getProviderAccount(id);
    if (!account) return false;
    const models = this.store.listModelDeployments(id);
    const agentIds = this.store.listAgentIdsUsingModelDeployments(models.map((model) => model.id));
    if (agentIds.length)
      throw new Error(
        `Delete the ${agentIds.length} Instance${agentIds.length === 1 ? "" : "s"} using this Provider before deleting the account.`,
      );
    for (const model of models)
      await this.litellm.deleteModel(model.litellmModelName).catch(() => undefined);
    return this.store.deleteProviderAccount(id);
  }

  async registerModel(input: CreateModelDeploymentInput): Promise<ModelDeployment> {
    const account = this.store.getProviderAccount(input.providerAccountId);
    const rawCredential = this.store.getProviderAccountCredential(input.providerAccountId);
    if (!account || !rawCredential) throw new Error("Provider Account was not found.");
    const draft = decodeCredential(account, rawCredential);
    const supportedTypes = catalog(draft.provider).modelTypes as readonly string[];
    if (!supportedTypes.includes(input.modelType))
      throw new Error(`${catalog(draft.provider).name} does not support ${input.modelType} registrations.`);
    const model = toModelSelection(input);
    try {
      const deployment = await this.registerDraftModel(account, draft, model);
      return this.store.saveModelDeployment(deployment);
    } catch (error) {
      const now = new Date().toISOString();
      return this.store.saveModelDeployment({
        id: randomUUID(),
        ...input,
        providerPresetId: account.presetId,
        providerName: catalog(draft.provider).name,
        endpoint: providerAdapter(draft.provider).endpoint(draft),
        litellmModelName: `pending/${account.id}/${input.modelId}`,
        status: "FAILED",
        checks: modelChecks("FAIL"),
        validationMessage: error instanceof Error ? error.message : "Model validation failed.",
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  private async createConnectionWithDiscovery(
    input: CreateProviderConnectionInput,
    discovery: ProviderDiscoveryResult,
  ): Promise<ProviderConnectionCreationResult> {
    const now = new Date().toISOString();
    const adapter = providerAdapter(input.connection.provider);
    const item = catalog(input.connection.provider);
    const account: ProviderAccount = {
      id: randomUUID(),
      name: input.connection.name,
      providerKind: input.connection.provider,
      presetId: input.connection.provider,
      endpoint: adapter.endpoint(input.connection),
      config: input.connection.config,
      discoveredModels: [...new Set([
        ...discovery.models.map((model) => model.modelId),
        ...input.models.map((model) => model.modelId),
      ])],
      status: "FAILED",
      checks: discovery.checks,
      credentialState: "STORED",
      validationMessage: "Model validation has not completed.",
      ...(discovery.latencyMs !== undefined ? { validationLatencyMs: discovery.latencyMs } : {}),
      createdAt: now,
      updatedAt: now,
    };
    const models: ModelDeployment[] = [];
    const failures: ProviderConnectionCreationResult["failures"] = [];
    for (const model of input.models) {
      if (!(item.modelTypes as readonly string[]).includes(model.modelType)) {
        failures.push({ model, message: `${item.name} does not support ${model.modelType} registrations.` });
        continue;
      }
      try {
        models.push(await this.registerDraftModel(account, input.connection, model));
      } catch (error) {
        failures.push({
          model,
          message: error instanceof Error ? error.message : "Model registration failed.",
        });
      }
    }
    if (!models.length)
      throw new Error(
        failures[0]?.message ?? "No selected model could be registered through LiteLLM.",
      );
    const validatedAt = new Date().toISOString();
    const savedAccount = this.store.saveProviderAccount({
      ...account,
      status: failures.length ? "DEGRADED" : "VALIDATED",
      checks: validationChecks(discovery, failures.length > 0),
      validationMessage: failures.length
        ? `${models.length} models registered; ${failures.length} need attention.`
        : `${models.length} models registered and validated through LiteLLM.`,
      validatedAt,
      updatedAt: validatedAt,
    }, encodeCredential(input.connection));
    for (const model of models) this.store.saveModelDeployment(model);
    return { account: savedAccount, models, failures };
  }

  private async registerDraftModel(
    account: ProviderAccount,
    draft: ProviderConnectionDraft,
    model: ProviderModelSelection,
  ): Promise<ModelDeployment> {
    const adapter = providerAdapter(draft.provider);
    let litellmModelName: string | undefined;
    try {
      litellmModelName = await this.litellm.registerModel({
        accountId: account.id,
        providerKind: draft.provider,
        model,
        litellmParams: adapter.toLiteLLMParams(draft, model),
      });
      await this.litellm.probeModel(litellmModelName, model.modelType);
      const now = new Date().toISOString();
      return {
        id: randomUUID(),
        providerAccountId: account.id,
        ...model,
        providerPresetId: account.presetId,
        providerName: catalog(draft.provider).name,
        endpoint: adapter.endpoint(draft),
        litellmModelName,
        status: "VALIDATED",
        checks: modelChecks("PASS"),
        validationMessage: `${model.modelId} is registered and responding through LiteLLM.`,
        validatedAt: now,
        createdAt: now,
        updatedAt: now,
      };
    } catch (error) {
      if (litellmModelName)
        await this.litellm.deleteModel(litellmModelName).catch(() => undefined);
      throw error;
    }
  }
}
