import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestStore } from "../test/store";
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
  models: ["deepseek-v4-flash", "deepseek-v4-pro"],
};

function liteLLM(): LiteLLMAdminClient {
  return {
    baseUrl: "http://litellm:4000",
    registerModel: vi.fn(async () => "tali/account/deepseek-chat"),
    deleteModel: vi.fn(async () => undefined),
    probeModel: vi.fn(async () => undefined),
    createInstanceKey: vi.fn(async () => ({ secret: "sk-instance", tokenId: "hashed-token" })),
    revokeKey: vi.fn(async () => undefined),
    listSpendLogs: vi.fn(async () => []),
  };
}

describe("ProviderService", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("stores one credential and automatically configures exposed catalog models", async () => {
    const validator: ProviderValidator = {
      validateConnection: vi.fn(async () => connectionResult),
      validateModel: vi.fn(async (input): Promise<ConnectionValidationResult> => ({
        ...connectionResult,
        checks: [...connectionResult.checks, { id: "inference" as const, label: `${input.modelType} capability probe`, status: "PASS" as const }],
        models: [input.modelId],
      })),
    };
    const store = createTestStore();
    const litellm = liteLLM();
    const service = new ProviderService(store, validator, litellm);
    const account = await service.registerAccount({
      name: "DeepSeek production",
      presetId: "deepseek",
      endpoint: "https://api.deepseek.com/v1",
      apiKey: "provider-secret-value",
      complianceDomain: "GLOBAL",
    });
    expect(account.status).toBe("VALIDATED");
    expect(account.discoveredModels).toContain("deepseek-v4-flash");
    expect(await service.listModels(account.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({ modelId: "deepseek-v4-pro", status: "VALIDATED" }),
      expect.objectContaining({ modelId: "deepseek-v4-flash", status: "VALIDATED" }),
    ]));
    expect(await service.listModels(account.id)).toHaveLength(2);
    expect(litellm.registerModel).toHaveBeenCalledTimes(2);
    expect(JSON.parse((await store.getProviderAccountCredential(account.id))!)).toMatchObject({
      version: 1,
      provider: "deepseek",
      credentials: { apiKey: "provider-secret-value" },
    });
    expect(JSON.stringify(await service.listAccounts())).not.toContain("provider-secret-value");
  });

  it("persists exactly one validated LLM as the global default", async () => {
    const validator: ProviderValidator = {
      validateConnection: vi.fn(async () => connectionResult),
      validateModel: vi.fn(),
    };
    const service = new ProviderService(createTestStore(), validator, liteLLM());
    const account = await service.registerAccount({
      name: "DeepSeek defaults",
      presetId: "deepseek",
      endpoint: "https://api.deepseek.com/v1",
      apiKey: "provider-secret-value",
      complianceDomain: "GLOBAL",
    });
    const [first, second] = await service.listModels(account.id);

    expect(await service.markModelAsDefault(first!.id)).toMatchObject({ id: first!.id, isDefault: true });
    expect((await service.listModels()).filter((model) => model.isDefault)).toEqual([
      expect.objectContaining({ id: first!.id }),
    ]);

    expect(await service.markModelAsDefault(second!.id)).toMatchObject({ id: second!.id, isDefault: true });
    expect((await service.listModels()).filter((model) => model.isDefault)).toEqual([
      expect.objectContaining({ id: second!.id }),
    ]);
  });

  it("deletes an unused account and unregisters its LiteLLM models", async () => {
    const validator: ProviderValidator = {
      validateConnection: vi.fn(async () => connectionResult),
      validateModel: vi.fn(),
    };
    const store = createTestStore();
    const litellm = liteLLM();
    const service = new ProviderService(store, validator, litellm);
    const account = await service.registerAccount({
      name: "DeepSeek disposable",
      presetId: "deepseek",
      endpoint: "https://api.deepseek.com/v1",
      apiKey: "provider-secret-value",
      complianceDomain: "GLOBAL",
    });

    await expect(service.deleteAccount(account.id)).resolves.toBe(true);
    expect(litellm.deleteModel).toHaveBeenCalledTimes(2);
    expect(await service.listAccounts()).toEqual([]);
    expect(await service.listModels()).toEqual([]);
  });

  it("does not persist a rejected Endpoint + key", async () => {
    const validator: ProviderValidator = {
      validateConnection: vi.fn(async () => { throw new Error("Provider rejected the credential."); }),
      validateModel: vi.fn(),
    };
    const service = new ProviderService(createTestStore(), validator, liteLLM());
    await expect(service.registerAccount({
      name: "DeepSeek rejected",
      presetId: "deepseek",
      endpoint: "https://api.deepseek.com/v1",
      apiKey: "provider-secret-value",
      complianceDomain: "GLOBAL",
    })).rejects.toThrow("rejected");
    expect(await service.listAccounts()).toEqual([]);
  });

  it("keeps a validated connection when one selected model fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      data: [{ id: "gpt-5.2" }, { id: "text-embedding-3-large" }],
    }), { status: 200 })));
    const litellm = liteLLM();
    vi.mocked(litellm.registerModel).mockImplementation(async ({ model }) => `tali/account/${model.modelId}`);
    vi.mocked(litellm.probeModel)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Embedding deployment is unavailable."));
    const service = new ProviderService(createTestStore(), undefined, litellm);
    const result = await service.createConnection({
      connection: {
        provider: "openai",
        name: "OpenAI production",
        config: { endpoint: "https://api.openai.com/v1" },
        credentials: { apiKey: "provider-secret-value" },
      },
      models: [
        { modelId: "gpt-5.2", displayName: "GPT-5.2", modelType: "llm" },
        { modelId: "text-embedding-3-large", displayName: "Embedding", modelType: "text-embedding" },
      ],
      complianceDomain: "GLOBAL",
    });

    expect(result.account.status).toBe("DEGRADED");
    expect(result.models).toHaveLength(1);
    expect(result.failures).toEqual([expect.objectContaining({ message: "Embedding deployment is unavailable." })]);
    expect(await service.listAccounts()).toHaveLength(1);
    expect(litellm.deleteModel).toHaveBeenCalledWith("tali/account/text-embedding-3-large");
  });
});
