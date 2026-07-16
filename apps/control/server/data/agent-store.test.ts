import { describe, expect, it } from "vitest";
import { AgentStore } from "./agent-store";

describe("AgentStore", () => {
  it("persists the NemoClaw agent resource", () => {
    const store = new AgentStore();
    const now = new Date().toISOString();
    store.save({
      id: "a",
      name: "Research",
      description: "",
      runtime: "nemoclaw",
      agentPlatform: "openclaw",
      providerConnectionId: "provider-a",
      sandboxName: "tasklattice-research-a",
      status: "PROVISIONING",
      provider: "deepseek",
      model: "deepseek-chat",
      policyId: "restricted",
      systemPrompt: "You are a research agent.",
      createdAt: now,
      updatedAt: now,
      logs: [],
    });
    expect(store.get("a")?.runtime).toBe("nemoclaw");
    expect(store.list()).toHaveLength(1);
    store.saveProviderConnection(
      {
        id: "provider-a",
        name: "DeepSeek validated",
        provider: "deepseek",
        endpoint: "https://api.deepseek.com",
        model: "deepseek-chat",
        inputFeePerMillionTokens: 0,
        outputFeePerMillionTokens: 0,
        credentialState: "STORED",
        status: "VALIDATED",
        checks: [],
        validationMessage: "Validated",
        createdAt: now,
        updatedAt: now,
      },
      "provider-secret-value",
    );
    expect(store.listProviderConnections()).toHaveLength(1);
    expect(store.getProviderConnectionCredential("provider-a")).toBe(
      "provider-secret-value",
    );
    store.saveProviderCredential("deepseek", "test-secret-value");
    expect(store.getProviderCredential("deepseek")).toBe("test-secret-value");
  });
});
