import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestStore } from "../test/store";
import type { LiteLLMAdminClient } from "./litellm-client";
import { ProviderService } from "./provider-service";

const deepSeekConnection = {
  connection: {
    provider: "deepseek" as const,
    name: "DeepSeek production",
    config: { endpoint: "https://api.deepseek.com/v1" },
    credentials: { apiKey: "provider-secret-value" },
  },
  models: [
    { modelId: "deepseek-chat", displayName: "DeepSeek Chat", modelType: "llm" as const },
    { modelId: "deepseek-reasoner", displayName: "DeepSeek Reasoner", modelType: "llm" as const },
  ],
  complianceDomain: "GLOBAL" as const,
};

function mockDeepSeekCatalog(): void {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    data: deepSeekConnection.models.map(({ modelId: id }) => ({ id })),
  }), { status: 200 })));
}

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
    mockDeepSeekCatalog();
    const store = createTestStore();
    const litellm = liteLLM();
    const service = new ProviderService(store, litellm);
    const { account } = await service.createConnection(deepSeekConnection);
    expect(account.status).toBe("VALIDATED");
    expect(account.discoveredModels).toContain("deepseek-chat");
    expect(await service.listModels(account.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({ modelId: "deepseek-chat", status: "VALIDATED" }),
      expect.objectContaining({ modelId: "deepseek-reasoner", status: "VALIDATED" }),
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
    mockDeepSeekCatalog();
    const service = new ProviderService(createTestStore(), liteLLM());
    const { account } = await service.createConnection(deepSeekConnection);
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
    mockDeepSeekCatalog();
    const store = createTestStore();
    const litellm = liteLLM();
    const service = new ProviderService(store, litellm);
    const { account } = await service.createConnection(deepSeekConnection);

    await expect(service.deleteAccount(account.id)).resolves.toBe(true);
    expect(litellm.deleteModel).toHaveBeenCalledTimes(2);
    expect(await service.listAccounts()).toEqual([]);
    expect(await service.listModels()).toEqual([]);
  });

  it("blocks Provider deletion while a Model Profile references one of its deployments", async () => {
    mockDeepSeekCatalog();
    const store = createTestStore();
    const litellm = liteLLM();
    const service = new ProviderService(store, litellm);
    const { account, models } = await service.createConnection(deepSeekConnection);
    const now = new Date().toISOString();
    await store.saveInferenceGateway({
      id: "litellm-default",
      name: "LiteLLM",
      baseUrl: "http://litellm:4000",
      adminUiUrl: "http://litellm:4000/ui",
      credentialSource: "ENVIRONMENT",
      status: "READY",
      validationMessage: "Ready",
      createdAt: now,
      updatedAt: now,
    });
    await store.saveModelProfile({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Production",
      description: "",
      gatewayId: "litellm-default",
      managementMode: "LITELLM_MANAGED",
      publicModelAlias: models[0]!.litellmModelName,
      routingPolicy: {
        version: 1,
        mode: "SINGLE",
        modelDeploymentId: models[0]!.id,
      },
      complianceDomain: "GLOBAL",
      status: "READY",
      isDefault: false,
      keyPolicy: { perInstance: true, rotationDays: 90 },
      auditPolicy: { controlPlane: true, requestLogs: true, capturePrompts: false },
      capabilities: {
        automaticRouting: "DISABLED",
        routerType: "UNKNOWN",
        sessionAffinity: "UNKNOWN",
        adaptiveRouting: "UNKNOWN",
        failover: "UNKNOWN",
        generalFallback: "UNKNOWN",
        contextWindowFallback: "UNKNOWN",
        contentPolicyFallback: "UNKNOWN",
        retries: "UNKNOWN",
        requestAudit: "UNKNOWN",
      },
      conditions: [],
      configurationHash: "sha256:test",
      observedGeneration: 1,
      validationMessage: "Ready",
      consumers: 0,
      createdAt: now,
      updatedAt: now,
    });

    await expect(service.deleteAccount(account.id)).rejects.toThrow("Model Profile");
    expect(litellm.deleteModel).not.toHaveBeenCalled();
  });

  it("does not persist a rejected Endpoint + key", async () => {
    mockDeepSeekCatalog();
    const litellm = liteLLM();
    vi.mocked(litellm.probeModel).mockRejectedValue(new Error("Provider rejected the credential."));
    const service = new ProviderService(createTestStore(), litellm);
    await expect(service.createConnection(deepSeekConnection)).rejects.toThrow("rejected");
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
    const service = new ProviderService(createTestStore(), litellm);
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
