import { describe, expect, it, vi } from "vitest";
import { createAgentSchema } from "@tasklattice/contracts";
import { agentSandboxName, applyObservedState } from "./agent-service";
import { AgentService } from "./agent-service";
import { AgentStore } from "../data/agent-store";
import type { LiteLLMAdminClient } from "../providers/litellm-client";
import type { RunnerClient } from "../runtime/nemoclaw-runner-client";
import { PolicyService } from "../policies/policy-service";

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

describe("Instance lifecycle reconciliation", () => {
  const now = new Date().toISOString();
  const agent = {
    id: "agent-a",
    name: "Research Assistant",
    description: "",
    runtime: "openshell" as const,
    agentPlatform: "openclaw" as const,
    modelDeploymentId: "model-a",
    providerAccountId: "provider-a",
    providerName: "DeepSeek",
    model: "deepseek-chat",
    modelType: "llm" as const,
    costKeyAlias: "tali-research:deepseek-chat",
    sandboxName: "tali-research",
    status: "PROVISIONING" as const,
    provisioningStage: "QUEUED" as const,
    policyId: "restricted" as const,
    systemPrompt: "Research the request and report the resulting evidence.",
    createdAt: now,
    updatedAt: now,
    logs: ["Instance creation accepted."],
  };

  it("preserves initialization logs when a recovered Runner has none", () => {
    expect(applyObservedState(agent, {
      name: agent.sandboxName,
      agentPlatform: "openclaw",
      phase: "PROVISIONING",
      provisioningStage: "POD",
      logs: [],
    })).toMatchObject({
      status: "PROVISIONING",
      provisioningStage: "POD",
      logs: ["Instance creation accepted."],
    });
  });

  it("records a useful failure when the Sandbox disappears", () => {
    expect(applyObservedState(agent, {
      name: agent.sandboxName,
      agentPlatform: "openclaw",
      phase: "NOT_FOUND",
      logs: [],
    })).toMatchObject({
      status: "FAILED",
      runtimePhase: "NOT_FOUND",
      error: expect.stringContaining("OpenShell Sandbox was not found"),
    });
  });
});

describe("OpenShell policy assignment", () => {
  it("loads the full-access GitHub example from the deployment catalog", () => {
    const policy = new PolicyService().resolve("github-full-access");

    expect(policy?.policyYaml).toContain("host: api.github.com");
    expect(policy?.policyYaml).toContain("access: full");
    expect(
      createAgentSchema.parse({
        name: "GitHub Operator",
        description: "",
        runtime: "openshell",
        modelDeploymentId: "model-a",
        policyId: "github-full-access",
        systemPrompt: "Operate on GitHub and report the resulting evidence.",
      }).policyId,
    ).toBe("github-full-access");
  });
});

describe("Agent selection", () => {
  const input = {
    name: "Research Assistant",
    description: "",
    runtime: "openshell" as const,
    modelDeploymentId: "model-a",
    policyId: "restricted" as const,
    systemPrompt: "Research the request and report the resulting evidence.",
  };

  it("keeps OpenClaw as the backward-compatible default", () => {
    expect(createAgentSchema.parse(input).agentPlatform).toBe("openclaw");
  });

  it("accepts Hermes as an Agent configured by NemoClaw", () => {
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
      providerKind: "deepseek",
      presetId: "deepseek",
      endpoint: "https://api.deepseek.com/v1",
      config: { endpoint: "https://api.deepseek.com/v1" },
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
      deleteModel: vi.fn(),
      probeModel: vi.fn(),
      createInstanceKey: vi.fn(async () => ({ secret: "sk-instance", tokenId: "hashed-token" })),
      revokeKey: vi.fn(async () => undefined),
      listSpendLogs: vi.fn(),
    };
    const service = new AgentService(store, runner, litellm);
    const agent = await service.create({
      name: "Research Assistant",
      description: "",
      runtime: "openshell",
      agentPlatform: "openclaw",
      modelDeploymentId: "model-a",
      policyId: "restricted",
      systemPrompt: "Research the request and report the resulting evidence.",
    });

    expect(litellm.createInstanceKey).toHaveBeenCalledWith(expect.objectContaining({ agentId: agent.id, modelName: "tali/provider/deepseek-chat" }));
    expect(runner.createSandbox).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "sk-instance", inferenceEndpoint: "http://litellm:4000/v1" }));
    expect(runner.createSandbox).toHaveBeenCalledWith(expect.objectContaining({ policyYaml: expect.stringContaining("/dev/null") }));
    await service.destroy(agent.id);
    expect(litellm.revokeKey).toHaveBeenCalledWith("hashed-token");
  });
});
