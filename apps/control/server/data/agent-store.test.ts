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
      runtime: "openshell",
      agentPlatform: "openclaw",
      modelDeploymentId: "model-a",
      providerAccountId: "provider-a",
      providerName: "DeepSeek",
      costKeyAlias: "tasklattice-research-a:deepseek-chat",
      sandboxName: "tasklattice-research-a",
      status: "PROVISIONING",
      model: "deepseek-chat",
      modelType: "llm",
      policyId: "restricted",
      systemPrompt: "You are a research agent.",
      createdAt: now,
      updatedAt: now,
      logs: [],
    });
    expect(store.get("a")?.runtime).toBe("openshell");
    expect(store.list()).toHaveLength(1);
    store.saveProviderAccount(
      {
        id: "provider-a",
        name: "DeepSeek validated",
        presetId: "deepseek",
        endpoint: "https://api.deepseek.com/v1",
        discoveredModels: ["deepseek-chat"],
        credentialState: "STORED",
        status: "VALIDATED",
        checks: [],
        validationMessage: "Validated",
        createdAt: now,
        updatedAt: now,
      },
      "provider-secret-value",
    );
    expect(store.listProviderAccounts()).toHaveLength(1);
    expect(store.getProviderAccountCredential("provider-a")).toBe(
      "provider-secret-value",
    );
  });
});
