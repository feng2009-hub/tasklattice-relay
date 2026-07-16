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
    this.store.assertNoLegacyProviderData();
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
    return this.validateAccount(account, input.apiKey);
  }

  async revalidateAccount(id: string): Promise<ProviderAccount | undefined> {
    const account = this.store.getProviderAccount(id);
    const apiKey = this.store.getProviderAccountCredential(id);
    if (!account || !apiKey) return undefined;
    return this.validateAccount(account, apiKey);
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

    const now = new Date().toISOString();
    const id = randomUUID();
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
      createdAt: now,
      updatedAt: now,
    };
    try {
      const validation = await this.validator.validateModel({
        apiKey,
        endpoint: account.endpoint,
        modelId: input.modelId,
        modelType: input.modelType,
      });
      const litellmModelName = await this.litellm.registerModel({
        accountId: account.id,
        apiKey,
        deployment: input,
        endpoint: account.endpoint,
        presetId: account.presetId,
      });
      const validatedAt = new Date().toISOString();
      return this.store.saveModelDeployment({
        ...base,
        litellmModelName,
        status: "VALIDATED",
        checks: validation.checks,
        validationMessage: `${validation.message} Registered in LiteLLM.`,
        validationLatencyMs: validation.latencyMs,
        validatedAt,
        updatedAt: validatedAt,
      });
    } catch (error) {
      return this.store.saveModelDeployment({
        ...base,
        validationMessage: error instanceof Error ? error.message : "Model validation failed.",
        updatedAt: new Date().toISOString(),
      });
    }
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
