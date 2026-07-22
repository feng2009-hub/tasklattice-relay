import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { AgentStore, parseAgent } from "./agent-store";

describe("AgentStore", () => {
  it("rejects pre-Inference-Group Instance records", () => {
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

  it("persists the NemoClaw agent resource", () => {
    const store = new AgentStore();
    const now = new Date().toISOString();
    store.save({
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
      inferenceGroupId: "group-a",
      inferenceBindingId: "binding-a",
      inferenceStatus: "READY",
      inferenceComplianceDomain: "CN_MAINLAND",
      inferenceCapabilities: {
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
      inferenceKeyFingerprint: "sha256:123456789abc",
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
    expect(store.listProviderAccounts()).toHaveLength(1);
    expect(store.getProviderAccountCredential("provider-a")).toBe(
      "provider-secret-value",
    );
  });

  it("ignores unversioned development records without deleting them", () => {
    const path = join(tmpdir(), `tasklattice-agent-store-${randomUUID()}.db`);
    const store = new AgentStore(path);
    const now = new Date().toISOString();
    const database = new DatabaseSync(path);
    database.prepare(
      "INSERT INTO agents (id, payload, created_at) VALUES (?, ?, ?)",
    ).run(
      "legacy-agent",
      JSON.stringify({
        id: "legacy-agent",
        name: "Legacy research",
        sandboxName: "tali-legacy-agent",
        policyId: "legacy-policy",
      }),
      now,
    );
    database.close();

    store.save({
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
      inferenceGroupId: "group-a",
      inferenceBindingId: "binding-a",
      inferenceStatus: "READY",
      inferenceComplianceDomain: "CN_MAINLAND",
      inferenceCapabilities: {
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
      inferenceKeyFingerprint: "sha256:123456789abc",
      policyId: "restricted",
      systemPrompt: "You are a research agent.",
      createdAt: now,
      updatedAt: now,
      logs: [],
    });

    expect(store.list().map((agent) => agent.id)).toEqual(["current-agent"]);
    expect(store.get("legacy-agent")).toBeUndefined();
    expect(store.listAgentsForReporting().map((agent) => agent.id)).toEqual([
      "current-agent",
    ]);
    expect(store.isSandboxPolicyInUse("legacy-policy")).toBe(false);

    const verifier = new DatabaseSync(path);
    expect(verifier.prepare("SELECT id FROM agents WHERE id = ?").get("legacy-agent"))
      .toMatchObject({ id: "legacy-agent" });
    verifier.close();
  });
});
