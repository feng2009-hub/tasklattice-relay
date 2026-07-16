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
      runtime: "nemoclaw",
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
  });
});
