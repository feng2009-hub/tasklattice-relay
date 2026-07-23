import { describe, expect, it } from "vitest";
import { parseAgent } from "./agent-store";
import { createTestStore } from "../test/store";

describe("AgentStore", () => {
  it("rejects pre-Model-Profile Instance records", () => {
    const now = new Date().toISOString();
    expect(() => parseAgent(JSON.stringify({
      id: "legacy-agent",
      name: "Legacy research",
      description: "",
      runtime: "nemoclaw",
      agentPlatform: "openclaw",
      providerConnectionId: "connection-a",
      provider: "deepseek",
      model: "deepseek-chat",
      policyId: "restricted",
      systemPrompt: "Research the request and report the evidence.",
      sandboxName: "tali-legacy-agent",
      status: "FAILED",
      createdAt: now,
      updatedAt: now,
      logs: ["Legacy provisioning failed."],
    }))).toThrow("Stored Instance data is incomplete");
  });

  it("persists the NemoClaw agent resource", async () => {
    const store = createTestStore();
    const now = new Date().toISOString();
    await store.save({
      schemaVersion: 1,
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
      inferenceMode: "PLATFORM_MANAGED",
      modelProfileId: "profile-a",
      modelProfileBindingId: "binding-a",
      modelProfileStatus: "READY",
      modelProfileComplianceDomain: "CN_MAINLAND",
      modelProfileCapabilities: {
        automaticRouting: "ENABLED",
        routerType: "COMPLEXITY_ROUTER",
        complexityTierCount: 4,
        sessionAffinity: "ENABLED",
        adaptiveRouting: "DISABLED",
        failover: "ENABLED",
        generalFallback: "ENABLED",
        contextWindowFallback: "DISABLED",
        contentPolicyFallback: "DISABLED",
        retries: "ENABLED",
        requestAudit: "ENABLED",
      },
      modelProfileKeyFingerprint: "sha256:123456789abc",
      policyId: "restricted",
      systemPrompt: "You are a research agent.",
      createdAt: now,
      updatedAt: now,
      logs: [],
    });
    expect((await store.get("a"))?.runtime).toBe("openshell");
    expect(await store.list()).toHaveLength(1);
    await store.saveProviderAccount(
      {
        id: "provider-a",
        name: "DeepSeek validated",
        providerKind: "deepseek",
        presetId: "deepseek",
        endpoint: "https://api.deepseek.com/v1",
        config: { endpoint: "https://api.deepseek.com/v1" },
        complianceDomain: "GLOBAL",
        endpointRegion: "global",
        crossBorderTransfer: false,
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
    expect(await store.listProviderAccounts()).toHaveLength(1);
    expect(await store.getProviderAccountCredential("provider-a")).toBe(
      "provider-secret-value",
    );
  });

  it("isolates records between workspaces", async () => {
    const store = createTestStore();
    const isolated = store.withWorkspace("other-workspace");
    const now = new Date().toISOString();
    await store.save({
      schemaVersion: 1,
      id: "current-agent",
      name: "Current research",
      description: "",
      runtime: "openshell",
      agentPlatform: "openclaw",
      modelDeploymentId: "model-a",
      providerAccountId: "provider-a",
      providerName: "DeepSeek",
      costKeyAlias: "tasklattice-current:deepseek-chat",
      sandboxName: "tasklattice-current",
      status: "READY",
      model: "deepseek-chat",
      modelType: "llm",
      inferenceMode: "PLATFORM_MANAGED",
      modelProfileId: "profile-a",
      modelProfileBindingId: "binding-a",
      modelProfileStatus: "READY",
      modelProfileComplianceDomain: "CN_MAINLAND",
      modelProfileCapabilities: {
        automaticRouting: "ENABLED",
        routerType: "COMPLEXITY_ROUTER",
        complexityTierCount: 4,
        sessionAffinity: "ENABLED",
        adaptiveRouting: "DISABLED",
        failover: "ENABLED",
        generalFallback: "ENABLED",
        contextWindowFallback: "DISABLED",
        contentPolicyFallback: "DISABLED",
        retries: "ENABLED",
        requestAudit: "ENABLED",
      },
      modelProfileKeyFingerprint: "sha256:123456789abc",
      policyId: "restricted",
      systemPrompt: "You are a research agent.",
      createdAt: now,
      updatedAt: now,
      logs: [],
    });

    expect((await store.list()).map((agent) => agent.id)).toEqual(["current-agent"]);
    expect(await isolated.get("current-agent")).toBeUndefined();
    expect((await store.listAgentsForReporting()).map((agent) => agent.id)).toEqual([
      "current-agent",
    ]);
    expect(await store.isSandboxPolicyInUse("legacy-policy")).toBe(false);
  });
});
