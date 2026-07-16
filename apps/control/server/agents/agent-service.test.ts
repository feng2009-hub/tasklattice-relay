import { describe, expect, it, vi } from "vitest";
import { createAgentSchema, sandboxPolicies } from "@tasklattice/contracts";
import { agentSandboxName } from "./agent-service";
import { AgentService } from "./agent-service";
import { AgentStore } from "../data/agent-store";
import type { LiteLLMAdminClient } from "../providers/litellm-client";
import type { RunnerClient } from "../runtime/nemoclaw-runner-client";

describe("Agent sandbox naming", () => {
  it("stays within the OpenShell service-routing limit", () => {
    const name = agentSandboxName(
      "A Very Long Research Assistant Name",
      "12345678-1234-4000-8000-123456789abc",
    );

    expect(name).toBe("tali-a-very-long-re-12345678");
    expect(name.length).toBeLessThanOrEqual(28);
    expect(name).toMatch(/^[a-z][a-z0-9-]+[a-z0-9]$/);
  });

  it("keeps the id suffix when the display name has no slug characters", () => {
    expect(
      agentSandboxName("研究助手", "abcdef01-1234-4000-8000-123456789abc"),
    ).toBe("tali-agent-abcdef01");
  });
});

describe("OpenShell policy assignment", () => {
  it("offers a full-access GitHub example that can be assigned to an Agent", () => {
    const policy = sandboxPolicies.find(
      (item) => item.id === "github-full-access",
    );

    expect(policy?.policyYaml).toContain("host: api.github.com");
    expect(policy?.policyYaml).toContain("access: full");
    expect(
      createAgentSchema.parse({
        name: "GitHub Operator",
        description: "",
        runtime: "nemoclaw",
        modelDeploymentId: "model-a",
        policyId: "github-full-access",
        systemPrompt: "Operate on GitHub and report the resulting evidence.",
      }).policyId,
    ).toBe("github-full-access");
  });
});

describe("Agent platform selection", () => {
  const input = {
    name: "Research Assistant",
    description: "",
    runtime: "nemoclaw" as const,
    modelDeploymentId: "model-a",
    policyId: "restricted" as const,
    systemPrompt: "Research the request and report the resulting evidence.",
  };

  it("keeps OpenClaw as the backward-compatible default", () => {
    expect(createAgentSchema.parse(input).agentPlatform).toBe("openclaw");
  });

  it("accepts Hermes as an explicit NemoClaw Agent platform", () => {
    expect(
      createAgentSchema.parse({ ...input, agentPlatform: "hermes" })
        .agentPlatform,
    ).toBe("hermes");
  });
});

describe("Instance cost key lifecycle", () => {
  it("creates one model-scoped key and revokes it when the Instance is destroyed", async () => {
    const store = new AgentStore();
    const now = new Date().toISOString();
    store.saveProviderAccount({
      id: "provider-a",
      name: "DeepSeek",
      presetId: "deepseek",
      endpoint: "https://api.deepseek.com/v1",
      discoveredModels: ["deepseek-chat"],
      status: "VALIDATED",
      checks: [],
      credentialState: "STORED",
      validationMessage: "Validated",
      createdAt: now,
      updatedAt: now,
    }, "provider-secret-value");
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
    const runner: RunnerClient = {
      createSandbox: vi.fn(async (input) => ({ name: input.name, agentPlatform: input.agentPlatform, phase: "READY" as const, logs: [] })),
      getSandbox: vi.fn(),
      getSandboxAudit: vi.fn(),
      destroySandbox: vi.fn(async (name, agentPlatform) => ({ name, agentPlatform, phase: "NOT_FOUND" as const, logs: [] })),
      getHealth: vi.fn(async () => ({ ok: true, mode: "fixture" })),
      terminalWebSocketUrl: vi.fn(() => "ws://runner/terminal"),
      authorizationHeaders: vi.fn(() => ({ authorization: "Bearer token" })),
    };
    const litellm: LiteLLMAdminClient = {
      baseUrl: "http://litellm:4000",
      registerModel: vi.fn(),
      createInstanceKey: vi.fn(async () => ({ secret: "sk-instance", tokenId: "hashed-token" })),
      revokeKey: vi.fn(async () => undefined),
      listSpendLogs: vi.fn(),
    };
    const service = new AgentService(store, runner, litellm);
    const agent = await service.create({
      name: "Research Assistant",
      description: "",
      runtime: "nemoclaw",
      agentPlatform: "openclaw",
      modelDeploymentId: "model-a",
      policyId: "restricted",
      systemPrompt: "Research the request and report the resulting evidence.",
    });

    expect(litellm.createInstanceKey).toHaveBeenCalledWith(expect.objectContaining({ agentId: agent.id, modelName: "tali/provider/deepseek-chat" }));
    expect(runner.createSandbox).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "sk-instance", inferenceEndpoint: "http://litellm:4000/v1" }));
    await service.destroy(agent.id);
    expect(litellm.revokeKey).toHaveBeenCalledWith("hashed-token");
  });
});
