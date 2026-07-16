import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
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
  models: ["deepseek-v4-flash", "deepseek-v4-pro"],
};

function liteLLM(): LiteLLMAdminClient {
  return {
    baseUrl: "http://litellm:4000",
    registerModel: vi.fn(async () => "tali/account/deepseek-chat"),
    deleteModel: vi.fn(async () => undefined),
    createInstanceKey: vi.fn(async () => ({ secret: "sk-instance", tokenId: "hashed-token" })),
    revokeKey: vi.fn(async () => undefined),
    listSpendLogs: vi.fn(async () => []),
  };
}

describe("ProviderService", () => {
  it("allows new Provider Accounts to coexist with legacy Provider Connection rows", async () => {
    const path = join(tmpdir(), `tasklattice-provider-${randomUUID()}.db`);
    const store = new AgentStore(path);
    const database = new DatabaseSync(path);
    database.prepare(
      "INSERT INTO provider_connections (id, payload, api_key, created_at) VALUES (?, ?, ?, ?)",
    ).run("legacy", "{}", "legacy-secret", new Date().toISOString());
    database.close();
    const validator: ProviderValidator = {
      validateConnection: vi.fn(async () => connectionResult),
      validateModel: vi.fn(),
    };
    const service = new ProviderService(store, validator, liteLLM());

    expect(service.listAccounts()).toEqual([]);
    expect(service.listModels()).toEqual([]);
    await expect(service.registerAccount({
      name: "DeepSeek production",
      presetId: "deepseek",
      endpoint: "https://api.deepseek.com/v1",
      apiKey: "provider-secret-value",
    })).resolves.toMatchObject({ status: "VALIDATED" });
    expect(service.listAccounts()).toHaveLength(1);
  });

  it("stores one credential and automatically configures exposed catalog models", async () => {
    const validator: ProviderValidator = {
      validateConnection: vi.fn(async () => connectionResult),
      validateModel: vi.fn(async (input): Promise<ConnectionValidationResult> => ({
        ...connectionResult,
        checks: [...connectionResult.checks, { id: "inference" as const, label: `${input.modelType} capability probe`, status: "PASS" as const }],
        models: [input.modelId],
      })),
    };
    const store = new AgentStore();
    const litellm = liteLLM();
    const service = new ProviderService(store, validator, litellm);
    const account = await service.registerAccount({
      name: "DeepSeek production",
      presetId: "deepseek",
      endpoint: "https://api.deepseek.com/v1",
      apiKey: "provider-secret-value",
    });
    expect(account.status).toBe("VALIDATED");
    expect(account.discoveredModels).toContain("deepseek-v4-flash");
    expect(service.listModels(account.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({ modelId: "deepseek-v4-pro", status: "VALIDATED" }),
      expect.objectContaining({ modelId: "deepseek-v4-flash", status: "VALIDATED" }),
    ]));
    expect(service.listModels(account.id)).toHaveLength(2);
    expect(litellm.registerModel).toHaveBeenCalledTimes(2);
    expect(store.getProviderAccountCredential(account.id)).toBe("provider-secret-value");
    expect(JSON.stringify(service.listAccounts())).not.toContain("provider-secret-value");
  });

  it("deletes an unused account and unregisters its LiteLLM models", async () => {
    const validator: ProviderValidator = {
      validateConnection: vi.fn(async () => connectionResult),
      validateModel: vi.fn(),
    };
    const store = new AgentStore();
    const litellm = liteLLM();
    const service = new ProviderService(store, validator, litellm);
    const account = await service.registerAccount({
      name: "DeepSeek disposable",
      presetId: "deepseek",
      endpoint: "https://api.deepseek.com/v1",
      apiKey: "provider-secret-value",
    });

    await expect(service.deleteAccount(account.id)).resolves.toBe(true);
    expect(litellm.deleteModel).toHaveBeenCalledTimes(2);
    expect(service.listAccounts()).toEqual([]);
    expect(service.listModels()).toEqual([]);
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
