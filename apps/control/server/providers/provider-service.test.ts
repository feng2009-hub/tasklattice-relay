import { describe, expect, it, vi } from "vitest";
import { AgentStore } from "../data/agent-store";
import type { LiteLLMAdminClient } from "./litellm-client";
import type { ConnectionValidationResult, ProviderValidator } from "./provider-validator";
import { ProviderService } from "./provider-service";

const connectionResult: ConnectionValidationResult = {
  checks: [
    { id: "endpoint", label: "Endpoint reachability", status: "PASS" },
    { id: "credentials", label: "Credential authorization", status: "PASS" },
    { id: "catalog", label: "Model catalog discovery", status: "PASS" },
  ],
  latencyMs: 18,
  message: "Connection validated.",
  models: ["deepseek-chat", "deepseek-reasoner"],
};

function liteLLM(): LiteLLMAdminClient {
  return {
    baseUrl: "http://litellm:4000",
    registerModel: vi.fn(async () => "tali/account/deepseek-chat"),
    createInstanceKey: vi.fn(async () => ({ secret: "sk-instance", tokenId: "hashed-token" })),
    revokeKey: vi.fn(async () => undefined),
    listSpendLogs: vi.fn(async () => []),
  };
}

describe("ProviderService", () => {
  it("stores one validated account credential and registers multiple categorized models below it", async () => {
    const validator: ProviderValidator = {
      validateConnection: vi.fn(async () => connectionResult),
      validateModel: vi.fn(async (input): Promise<ConnectionValidationResult> => ({
        ...connectionResult,
        checks: [...connectionResult.checks, { id: "inference" as const, label: `${input.modelType} capability probe`, status: "PASS" as const }],
        models: [input.modelId],
      })),
    };
    const store = new AgentStore();
    const service = new ProviderService(store, validator, liteLLM());
    const account = await service.registerAccount({
      name: "DeepSeek production",
      presetId: "deepseek",
      endpoint: "https://api.deepseek.com/v1",
      apiKey: "provider-secret-value",
    });
    const model = await service.registerModel({
      providerAccountId: account.id,
      modelId: "deepseek-chat",
      displayName: "DeepSeek Chat",
      modelType: "llm",
      inputFeePerMillionTokens: 0.28,
      outputFeePerMillionTokens: 0.42,
    });

    expect(account.status).toBe("VALIDATED");
    expect(account.discoveredModels).toContain("deepseek-chat");
    expect(model.status).toBe("VALIDATED");
    expect(store.getProviderAccountCredential(account.id)).toBe("provider-secret-value");
    expect(JSON.stringify(service.listAccounts())).not.toContain("provider-secret-value");
  });

  it("keeps a rejected Endpoint + key unavailable", async () => {
    const validator: ProviderValidator = {
      validateConnection: vi.fn(async () => { throw new Error("Provider rejected the credential."); }),
      validateModel: vi.fn(),
    };
    const service = new ProviderService(new AgentStore(), validator, liteLLM());
    const account = await service.registerAccount({
      name: "DeepSeek rejected",
      presetId: "deepseek",
      endpoint: "https://api.deepseek.com/v1",
      apiKey: "provider-secret-value",
    });
    expect(account.status).toBe("FAILED");
    expect(account.validationMessage).toContain("rejected");
  });
});
