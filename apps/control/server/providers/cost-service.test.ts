import { describe, expect, it, vi } from "vitest";
import { AgentStore } from "../data/agent-store";
import type { LiteLLMAdminClient } from "./litellm-client";
import { CostService } from "./cost-service";

describe("CostService", () => {
  it("attributes LiteLLM spend to Agent user_id and registered model Endpoint", async () => {
    const store = new AgentStore();
    const now = "2026-07-16T00:00:00.000Z";
    store.save({
      schemaVersion: 1,
      id: "agent-a",
      name: "Research",
      description: "",
      runtime: "openshell",
      agentPlatform: "openclaw",
      modelDeploymentId: "model-a",
      providerAccountId: "provider-a",
      providerName: "DeepSeek",
      model: "deepseek-chat",
      modelType: "llm",
      inferenceMode: "PLATFORM_MANAGED",
      inferenceGroupId: "group-a",
      inferenceBindingId: "binding-a",
      inferenceStatus: "READY",
      inferenceComplianceDomain: "GLOBAL",
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
      costKeyAlias: "tali-research:deepseek-chat",
      sandboxName: "tali-research-agent-a",
      status: "READY",
      policyId: "restricted",
      systemPrompt: "You are a research Agent.",
      createdAt: now,
      updatedAt: now,
      logs: [],
    });
    store.saveModelDeployment({
      id: "model-a",
      isDefault: false,
      providerAccountId: "provider-a",
      providerPresetId: "deepseek",
      providerName: "DeepSeek",
      endpoint: "https://api.deepseek.com/v1",
      complianceDomain: "GLOBAL",
      endpointRegion: "global",
      crossBorderTransfer: false,
      modelId: "deepseek-chat",
      displayName: "DeepSeek Chat",
      modelType: "llm",
      litellmModelName: "tali/provider/deepseek-chat",
      status: "VALIDATED",
      checks: [],
      validationMessage: "Validated",
      createdAt: now,
      updatedAt: now,
    });
    const litellm: LiteLLMAdminClient = {
      baseUrl: "http://litellm:4000",
      registerModel: vi.fn(),
      deleteModel: vi.fn(),
      probeModel: vi.fn(),
      createInstanceKey: vi.fn(),
      revokeKey: vi.fn(),
      listSpendLogs: vi.fn(async () => [
        { end_user: "agent-a", model_group: "tali/provider/deepseek-chat", spend: 1.25, prompt_tokens: 100, completion_tokens: 50, startTime: now, request_id: "r1" },
        { end_user: "agent-a", model_group: "tali/provider/deepseek-chat", spend: 0.75, prompt_tokens: 80, completion_tokens: 20, startTime: now, request_id: "r2" },
      ]),
    };
    const report = await new CostService(store, litellm).report("2026-07-01", "2026-07-16");

    expect(report.totalSpend).toBe(2);
    expect(report.byInstance[0]).toMatchObject({ id: "agent-a", label: "Research", spend: 2, requests: 2 });
    expect(report.byModel[0]).toMatchObject({ label: "DeepSeek Chat", detail: "DeepSeek · api.deepseek.com", spend: 2 });
    expect(report.byProviderAccount[0]).toMatchObject({ id: "provider-a", label: "Unassigned Provider", detail: "DeepSeek", spend: 2 });
  });

  it("reports cost without treating stale Provider Connection rows as seed data", async () => {
    const path = join(tmpdir(), `tasklattice-cost-${randomUUID()}.db`);
    const store = new AgentStore(path);
    const database = new DatabaseSync(path);
    database.prepare(
      "INSERT INTO provider_connections (id, payload, api_key, created_at) VALUES (?, ?, ?, ?)",
    ).run("legacy", "{}", "legacy-secret", new Date().toISOString());
    database.prepare(
      "INSERT INTO agents (id, payload, created_at) VALUES (?, ?, ?)",
    ).run(
      "legacy-agent",
      JSON.stringify({ id: "legacy-agent", name: "Legacy", sandboxName: "legacy-sandbox" }),
      new Date().toISOString(),
    );
    database.close();
    const litellm: LiteLLMAdminClient = {
      baseUrl: "http://litellm:4000",
      registerModel: vi.fn(),
      deleteModel: vi.fn(),
      probeModel: vi.fn(),
      createInstanceKey: vi.fn(),
      revokeKey: vi.fn(),
      listSpendLogs: vi.fn(async () => []),
    };

    await expect(new CostService(store, litellm).report("2026-07-01", "2026-07-16"))
      .resolves.toMatchObject({ totalSpend: 0, byInstance: [], byModel: [], byProviderAccount: [] });
    expect(store.listModelDeployments()).toEqual([]);
  });

  it("attributes a public model alias to its Inference Group and LiteLLM gateway", async () => {
    const store = new AgentStore();
    const now = "2026-07-16T00:00:00.000Z";
    store.saveInferenceGateway({
      id: "gateway-a",
      name: "Production LiteLLM",
      baseUrl: "https://litellm.example.com",
      adminUiUrl: "https://litellm.example.com/ui",
      complianceDomain: "GLOBAL",
      credentialSource: "ENVIRONMENT",
      status: "READY",
      validationMessage: "Validated",
      validatedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    store.saveInferenceGroup({
      id: "group-a",
      name: "Production inference",
      description: "Managed routing",
      gatewayId: "gateway-a",
      managementMode: "LITELLM_MANAGED",
      publicModelAlias: "production-chat",
      complianceDomain: "GLOBAL",
      status: "READY",
      isDefault: true,
      keyPolicy: { perInstance: true, rotationDays: 90 },
      auditPolicy: { controlPlane: true, requestLogs: true, capturePrompts: false },
      capabilities: {
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
      conditions: [],
      configurationHash: "hash",
      observedGeneration: 1,
      validationMessage: "Validated",
      consumers: 0,
      createdAt: now,
      updatedAt: now,
    });
    const litellm: LiteLLMAdminClient = {
      baseUrl: "http://litellm:4000",
      registerModel: vi.fn(),
      deleteModel: vi.fn(),
      probeModel: vi.fn(),
      createInstanceKey: vi.fn(),
      revokeKey: vi.fn(),
      listSpendLogs: vi.fn(async () => [{
        end_user: "agent-a",
        model_group: "production-chat",
        spend: 0.5,
        prompt_tokens: 40,
        completion_tokens: 10,
        startTime: now,
        request_id: "r1",
      }]),
    };

    const report = await new CostService(store, litellm).report("2026-07-01", "2026-07-16");

    expect(report.byModel[0]).toMatchObject({
      id: "production-chat",
      label: "Production inference",
      detail: "GLOBAL · LiteLLM-managed routing",
      spend: 0.5,
    });
    expect(report.byProviderAccount[0]).toMatchObject({
      id: "gateway-a",
      label: "Production LiteLLM",
      detail: "Inference Group · Production inference",
      spend: 0.5,
    });
  });
});
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
