import { randomUUID } from "node:crypto";
import {
  providerPresets,
  type CreateModelDeploymentInput,
  type CreateProviderAccountInput,
  type ModelDeployment,
  type ProviderAccount,
  type ProviderValidationCheck,
} from "@tasklattice/contracts";
import { AgentStore } from "../data/agent-store";
import { LiteLLMClient, type LiteLLMAdminClient } from "./litellm-client";
import { OpenAICompatibleValidator, type ProviderValidator } from "./provider-validator";

const failedConnectionChecks = (): ProviderValidationCheck[] => [
  { id: "endpoint", label: "Endpoint reachability", status: "FAIL" },
  { id: "credentials", label: "Credential authorization", status: "FAIL" },
  { id: "catalog", label: "Model catalog discovery", status: "FAIL" },
];

const failedModelChecks = (): ProviderValidationCheck[] => [
  { id: "endpoint", label: "Endpoint reachability", status: "PASS" },
  { id: "credentials", label: "Credential authorization", status: "PASS" },
  { id: "catalog", label: "Model catalog discovery", status: "PASS" },
  { id: "inference", label: "Model capability probe", status: "FAIL" },
];

const catalogModelChecks = (): ProviderValidationCheck[] => [
  { id: "endpoint", label: "Endpoint reachability", status: "PASS" },
  { id: "credentials", label: "Credential authorization", status: "PASS" },
  { id: "catalog", label: "Model catalog discovery", status: "PASS" },
  { id: "inference", label: "Model catalog entitlement", status: "PASS" },
];

export class ProviderService {
  constructor(
    readonly store = new AgentStore(),
    readonly validator: ProviderValidator = new OpenAICompatibleValidator(),
    readonly litellm: LiteLLMAdminClient = new LiteLLMClient(),
  ) {}

  listAccounts(): ProviderAccount[] {
    return this.store.listProviderAccounts();
  }

  listModels(providerAccountId?: string): ModelDeployment[] {
    return this.store.listModelDeployments(providerAccountId);
  }

  async registerAccount(input: CreateProviderAccountInput): Promise<ProviderAccount> {
    const now = new Date().toISOString();
    const account: ProviderAccount = {
      id: randomUUID(),
      name: input.name,
      presetId: input.presetId,
      endpoint: input.endpoint,
      discoveredModels: [],
      credentialState: "STORED",
      status: "FAILED",
      checks: failedConnectionChecks(),
      validationMessage: "Validation has not completed.",
      createdAt: now,
      updatedAt: now,
    };
    this.store.saveProviderAccount(account, input.apiKey);
    const validated = await this.validateAccount(account, input.apiKey);
    return this.configurePresetModels(validated);
  }

  async revalidateAccount(id: string): Promise<ProviderAccount | undefined> {
    const account = this.store.getProviderAccount(id);
    const apiKey = this.store.getProviderAccountCredential(id);
    if (!account || !apiKey) return undefined;
    const validated = await this.validateAccount(account, apiKey);
    return this.configurePresetModels(validated);
  }

  async deleteAccount(id: string): Promise<boolean> {
    const account = this.store.getProviderAccount(id);
    if (!account) return false;
    const models = this.store.listModelDeployments(id);
    const agentIds = this.store.listAgentIdsUsingModelDeployments(
      models.map((model) => model.id),
    );
    if (agentIds.length)
      throw new Error(
        `Delete the ${agentIds.length} Instance${agentIds.length === 1 ? "" : "s"} using this Provider before deleting the account.`,
      );
    for (const model of models) {
      if (model.status === "VALIDATED")
        await this.litellm.deleteModel(model.litellmModelName);
    }
    return this.store.deleteProviderAccount(id);
  }

  async registerModel(input: CreateModelDeploymentInput): Promise<ModelDeployment> {
    const account = this.store.getProviderAccount(input.providerAccountId);
    const apiKey = this.store.getProviderAccountCredential(input.providerAccountId);
    if (!account || !apiKey) throw new Error("Provider Account was not found.");
    if (account.status !== "VALIDATED")
      throw new Error("Validate the Provider Account before adding models.");
    const preset = providerPresets.find((item) => item.id === account.presetId);
    if (!preset) throw new Error("Provider catalog entry was not found.");
    if (!(preset?.modelTypes as readonly string[] | undefined)?.includes(input.modelType))
      throw new Error(`${preset?.name ?? "This Provider"} does not support ${input.modelType} registrations.`);

    if (!account.discoveredModels.includes(input.modelId))
      throw new Error(
        `${input.modelId} is not available to this credential. Revalidate the Provider catalog before registering it.`,
      );
    const matchingModels = this.store
      .listModelDeployments(input.providerAccountId)
      .filter((model) => model.modelId === input.modelId);
    const existing = matchingModels.find((model) => model.status === "VALIDATED")
      ?? matchingModels[0];
    if (existing?.status === "VALIDATED") return existing;

    const now = new Date().toISOString();
    const id = existing?.id ?? randomUUID();
    const base: ModelDeployment = {
      id,
      ...input,
      providerPresetId: account.presetId,
      providerName: preset.name,
      endpoint: account.endpoint,
      litellmModelName: `pending/${id}`,
      status: "FAILED",
      checks: failedModelChecks(),
      validationMessage: "Validation has not completed.",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    try {
      const litellmModelName = await this.litellm.registerModel({
        accountId: account.id,
        apiKey,
        deployment: input,
        endpoint: account.endpoint,
        presetId: account.presetId,
      });
      const validatedAt = new Date().toISOString();
      const deployment = this.store.saveModelDeployment({
        ...base,
        litellmModelName,
        status: "VALIDATED",
        checks: catalogModelChecks(),
        validationMessage: `${input.modelId} is available to this credential and registered in LiteLLM.`,
        validatedAt,
        updatedAt: validatedAt,
      });
      for (const duplicate of matchingModels) {
        if (duplicate.id !== deployment.id && duplicate.status === "FAILED")
          this.store.deleteModelDeployment(duplicate.id);
      }
      return deployment;
    } catch (error) {
      return this.store.saveModelDeployment({
        ...base,
        validationMessage: error instanceof Error ? error.message : "Model validation failed.",
        updatedAt: new Date().toISOString(),
      });
    }
  }

  private async configurePresetModels(account: ProviderAccount): Promise<ProviderAccount> {
    if (account.status !== "VALIDATED") return account;
    const preset = providerPresets.find((item) => item.id === account.presetId);
    if (!preset?.defaultModels.length) return account;
    const availableModels = preset.defaultModels.filter((model) =>
      account.discoveredModels.includes(model.modelId),
    );
    const configured: ModelDeployment[] = [];
    for (const model of availableModels) {
      configured.push(await this.registerModel({
        providerAccountId: account.id,
        ...model,
      }));
    }
    const validatedCount = configured.filter(
      (model) => model.status === "VALIDATED",
    ).length;
    const configuredMessage = availableModels.length
      ? ` ${validatedCount} of ${availableModels.length} catalog models configured automatically.`
      : " No catalog defaults were exposed to this credential.";
    return this.store.saveProviderAccount({
      ...account,
      validationMessage: `${account.validationMessage}${configuredMessage}`,
      updatedAt: new Date().toISOString(),
    });
  }

  private async validateAccount(account: ProviderAccount, apiKey: string): Promise<ProviderAccount> {
    try {
      const result = await this.validator.validateConnection(account.endpoint, apiKey);
      const now = new Date().toISOString();
      return this.store.saveProviderAccount({
        ...account,
        discoveredModels: result.models,
        status: "VALIDATED",
        checks: result.checks,
        validationMessage: result.message,
        validationLatencyMs: result.latencyMs,
        validatedAt: now,
        updatedAt: now,
      });
    } catch (error) {
      return this.store.saveProviderAccount({
        ...account,
        discoveredModels: [],
        status: "FAILED",
        checks: failedConnectionChecks(),
        validationMessage: error instanceof Error ? error.message : "Provider validation failed.",
        updatedAt: new Date().toISOString(),
      });
    }
  }
}
