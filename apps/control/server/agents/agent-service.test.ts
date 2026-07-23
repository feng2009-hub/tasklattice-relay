import { describe, expect, it, vi } from "vitest";
import { createAgentSchema } from "@tasklattice/contracts";
import { agentSandboxName, applyObservedState } from "./agent-service";
import { AgentService } from "./agent-service";
import { createTestStore } from "../test/store";
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
    schemaVersion: 1 as const,
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
    inferenceMode: "PLATFORM_MANAGED" as const,
    inferenceGroupId: "group-a",
    inferenceBindingId: "binding-a",
    inferenceStatus: "READY" as const,
    inferenceComplianceDomain: "GLOBAL" as const,
    inferenceCapabilities: {
      automaticRouting: "ENABLED" as const,
      routerType: "COMPLEXITY_ROUTER" as const,
      complexityTierCount: 4,
      sessionAffinity: "ENABLED" as const,
      adaptiveRouting: "DISABLED" as const,
      failover: "ENABLED" as const,
      generalFallback: "ENABLED" as const,
      contextWindowFallback: "DISABLED" as const,
      contentPolicyFallback: "DISABLED" as const,
      retries: "ENABLED" as const,
      requestAudit: "ENABLED" as const,
    },
    inferenceKeyFingerprint: "sha256:123456789abc",
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
  it("loads the full-access GitHub example from the deployment catalog", async () => {
    const policy = await new PolicyService(createTestStore()).resolve("github-full-access");

    expect(policy?.policyYaml).toContain("host: api.github.com");
    expect(policy?.policyYaml).toContain("access: full");
    expect(
      createAgentSchema.parse({
        name: "GitHub Operator",
        description: "",
        runtime: "openshell",
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
    policyId: "restricted" as const,
    systemPrompt: "Research the request and report the resulting evidence.",
  };

  it("uses OpenClaw as the default Agent implementation", () => {
    expect(createAgentSchema.parse(input).agentPlatform).toBe("openclaw");
  });

  it("accepts Hermes as an Agent configured by NemoClaw", () => {
    expect(
      createAgentSchema.parse({ ...input, agentPlatform: "hermes" })
        .agentPlatform,
    ).toBe("hermes");
  });

  it("keeps specialization and capability references in the create contract", () => {
    expect(createAgentSchema.parse({
      ...input,
      specializationId: "hr",
      skillIds: ["employee-policy-search"],
      mcpServerIds: ["workday"],
      knowledgeSourceIds: ["company-hr-handbook"],
    })).toMatchObject({
      specializationId: "hr",
      skillIds: ["employee-policy-search"],
      mcpServerIds: ["workday"],
      knowledgeSourceIds: ["company-hr-handbook"],
    });
  });

  it("resolves Role and capability references from the PostgreSQL catalog", async () => {
    const service = new AgentService(createTestStore());
    await expect(service.create({
      ...input,
      agentPlatform: "openclaw",
      specializationId: "missing-role",
    })).rejects.toThrow("available Agent Role");
    await expect(service.create({
      ...input,
      agentPlatform: "openclaw",
      specializationId: "general-purpose",
      skillIds: ["missing-skill"],
    })).rejects.toThrow("Skill configuration is unavailable");
  });
});

describe("Instance Inference Group binding lifecycle", () => {
  it("creates one Team-scoped key and revokes it when the Instance is destroyed", async () => {
    const store = createTestStore();
    const now = new Date().toISOString();
    await store.saveInferenceGroup({
      id: "group-a",
      name: "Production inference",
      description: "Managed inference for production Instances.",
      gatewayId: "litellm-default",
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
      conditions: [{ type: "COMPLIANCE", status: "PASS", reason: "All backing deployments are GLOBAL." }],
      configurationHash: "sha256:test",
      observedGeneration: 1,
      validationMessage: "LiteLLM binding is ready.",
      consumers: 0,
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
      createInferenceGroupTeam: vi.fn(async () => "team-a"),
      createInferenceGroupKey: vi.fn(async () => ({ secret: "sk-instance", tokenId: "hashed-token" })),
      revokeKey: vi.fn(async () => undefined),
      listSpendLogs: vi.fn(),
    };
    const service = new AgentService(store, runner, litellm);
    const agent = await service.create({
      name: "Research Assistant",
      description: "",
      runtime: "openshell",
      agentPlatform: "openclaw",
      policyId: "restricted",
      systemPrompt: "Research the request and report the resulting evidence.",
    });

    expect(litellm.createInferenceGroupKey).toHaveBeenCalledWith(expect.objectContaining({ agentId: agent.id, modelAlias: "production-chat", teamId: "team-a" }));
    expect(runner.createSandbox).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "sk-instance", inferenceEndpoint: "http://litellm:4000/v1" }));
    expect(runner.createSandbox).toHaveBeenCalledWith(expect.objectContaining({ policyYaml: expect.stringContaining("/dev/null") }));
    await service.destroy(agent.id);
    expect(litellm.revokeKey).toHaveBeenCalledWith("hashed-token");
  });
});
