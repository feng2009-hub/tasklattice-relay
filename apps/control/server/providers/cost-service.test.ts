import { describe, expect, it, vi } from "vitest";
import { AgentStore } from "../data/agent-store";
import type { LiteLLMAdminClient } from "./litellm-client";
import { CostService } from "./cost-service";

describe("CostService", () => {
  it("attributes LiteLLM spend to Agent user_id and registered model Endpoint", async () => {
    const store = new AgentStore();
    const now = "2026-07-16T00:00:00.000Z";
    store.save({
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
      providerAccountId: "provider-a",
      providerPresetId: "deepseek",
      providerName: "DeepSeek",
      endpoint: "https://api.deepseek.com/v1",
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
});
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
