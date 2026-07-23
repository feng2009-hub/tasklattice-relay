import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAgentSchema, createInferenceGroupSchema } from "@tasklattice/contracts";
import { AgentStore } from "../data/agent-store";
import type { LiteLLMAdminClient, LiteLLMInferenceInspection } from "../providers/litellm-client";
import { InferenceGroupResolver, InferenceGroupService } from "./inference-group-service";

beforeEach(() => vi.stubEnv("LITELLM_COMPLIANCE_DOMAIN", "CN_MAINLAND"));
afterEach(() => vi.unstubAllEnvs());

const capabilities = {
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
} as const;

function adapter(inspection: Omit<LiteLLMInferenceInspection, "configurationHash"> & { configurationHash?: string }): LiteLLMAdminClient {
  return {
    baseUrl: "http://litellm:4000",
    registerModel: vi.fn(),
    deleteModel: vi.fn(),
    probeModel: vi.fn(),
    createInstanceKey: vi.fn(),
    revokeKey: vi.fn(),
    listSpendLogs: vi.fn(),
    inspectInferenceGroup: vi.fn(async () => ({ configurationHash: "sha256:litellm", ...inspection })),
    createInferenceGroupTeam: vi.fn(async () => "team-a"),
    createInferenceGroupKey: vi.fn(async () => ({ secret: "sk-instance-secret", tokenId: "token-hash" })),
    deleteInferenceGroupTeam: vi.fn(),
  };
}

function input(domain: "CN_MAINLAND" | "GLOBAL" = "CN_MAINLAND") {
  return createInferenceGroupSchema.parse({
    name: "Production inference",
    description: "Managed production inference access.",
    gatewayId: "litellm-default",
    publicModelAlias: "production-chat",
    complianceDomain: domain,
    isDefault: true,
  });
}

describe("Inference Group contracts", () => {
  it("keeps model selection out of Instance creation", () => {
    expect(() => createAgentSchema.parse({
      name: "Research Agent",
      description: "",
      runtime: "openshell",
      systemPrompt: "Research the request and report the evidence.",
      modelDeploymentId: "must-be-ignored",
    })).toThrow();
  });

  it("accepts an explicit Inference Group without exposing model routing", () => {
    const inferenceGroupId = "2f3d37d9-fd85-49ee-80b3-06861b8c44b1";
    expect(createAgentSchema.parse({
      name: "Research Agent",
      description: "",
      runtime: "openshell",
      systemPrompt: "Research the request and report the evidence.",
      inferenceGroupId,
    }).inferenceGroupId).toBe(inferenceGroupId);
  });

  it("defaults secret-safe key and audit policies", () => {
    expect(input()).toMatchObject({
      keyPolicy: { perInstance: true, rotationDays: 90 },
      auditPolicy: { controlPlane: true, requestLogs: true, capturePrompts: false },
    });
  });

  it("accepts concise region-oriented names such as CN", () => {
    expect(createInferenceGroupSchema.parse({
      ...input(),
      name: "CN",
    }).name).toBe("CN");
  });
});

describe("Inference Group validation", () => {
  it("becomes READY and default only after a matching LiteLLM inspection", async () => {
    const service = new InferenceGroupService(new AgentStore(), adapter({
      exists: true,
      version: "1.94.1",
      modelCount: 2,
      complianceDomains: ["CN_MAINLAND"],
      complianceUnknown: false,
      capabilities,
    }));
    const group = await service.create(input());
    expect(group).toMatchObject({ status: "READY", isDefault: true, capabilities });
    expect(group.conditions).toContainEqual(expect.objectContaining({ type: "COMPLIANCE", status: "PASS" }));
  });

  it("rejects CN/GLOBAL mixing", async () => {
    const service = new InferenceGroupService(new AgentStore(), adapter({
      exists: true,
      version: "1.94.1",
      modelCount: 2,
      complianceDomains: ["CN_MAINLAND", "GLOBAL"],
      complianceUnknown: false,
      capabilities,
    }));
    const group = await service.create(input());
    expect(group.status).toBe("NON_COMPLIANT");
    expect(group.isDefault).toBe(false);
  });

  it("rejects an Inference Group that does not match its Gateway compliance domain", async () => {
    vi.stubEnv("LITELLM_COMPLIANCE_DOMAIN", "GLOBAL");
    const client = adapter({
      exists: true,
      version: "1.94.1",
      modelCount: 1,
      complianceDomains: ["CN_MAINLAND"],
      complianceUnknown: false,
      capabilities,
    });
    const service = new InferenceGroupService(new AgentStore(), client);

    const group = await service.create(input("CN_MAINLAND"));

    expect(group.status).toBe("NON_COMPLIANT");
    expect(group.conditions).toContainEqual(expect.objectContaining({ type: "COMPLIANCE", status: "FAIL" }));
    expect(client.inspectInferenceGroup).not.toHaveBeenCalled();
  });

  it("fails closed when compliance metadata is UNKNOWN", async () => {
    const service = new InferenceGroupService(new AgentStore(), adapter({
      exists: true,
      modelCount: 1,
      complianceDomains: [],
      complianceUnknown: true,
      capabilities,
    }));
    const group = await service.create(input());
    expect(group.status).toBe("NON_COMPLIANT");
    expect(group.conditions).toContainEqual(expect.objectContaining({ type: "COMPLIANCE", status: "UNKNOWN" }));
  });

  it("marks unsupported Auto Router versions explicitly", async () => {
    const service = new InferenceGroupService(new AgentStore(), adapter({
      exists: true,
      version: "1.86.2",
      modelCount: 1,
      complianceDomains: ["CN_MAINLAND"],
      complianceUnknown: false,
      capabilities,
      unsupportedReason: "LiteLLM 1.86.2 cannot safely support Auto Router v2.",
    }));
    expect((await service.create(input())).status).toBe("UNSUPPORTED");
  });
});

describe("InferenceGroupResolver", () => {
  it("requires exactly one READY default", async () => {
    const store = new AgentStore();
    const service = new InferenceGroupService(store, adapter({ exists: true, modelCount: 1, complianceDomains: ["CN_MAINLAND"], complianceUnknown: false, capabilities }));
    const ready = await service.create(input());
    expect(new InferenceGroupResolver(store).resolveDefault().id).toBe(ready.id);
    store.saveInferenceGroup({ ...ready, id: "second", name: "Second default", createdAt: new Date().toISOString() });
    expect(() => new InferenceGroupResolver(store).resolveDefault()).toThrow("Multiple default");
  });

  it("does not resolve a suspended group", async () => {
    const store = new AgentStore();
    const service = new InferenceGroupService(store, adapter({ exists: true, modelCount: 1, complianceDomains: ["CN_MAINLAND"], complianceUnknown: false, capabilities }));
    const ready = await service.create(input());
    service.update(ready.id, { suspended: true });
    expect(() => service.resolver.resolveDefault()).toThrow("suspended");
  });

  it("binds an explicitly selected READY group instead of the default", async () => {
    const store = new AgentStore();
    const client = adapter({ exists: true, modelCount: 1, complianceDomains: ["CN_MAINLAND"], complianceUnknown: false, capabilities });
    const service = new InferenceGroupService(store, client);
    const defaultGroup = await service.create(input());
    const selectedGroup = store.saveInferenceGroup({
      ...defaultGroup,
      id: "2f3d37d9-fd85-49ee-80b3-06861b8c44b1",
      name: "Selected inference",
      publicModelAlias: "selected-chat",
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const binding = await service.bindAgent("agent-selected", selectedGroup.id);

    expect(binding.group.id).toBe(selectedGroup.id);
    expect(client.createInferenceGroupKey).toHaveBeenCalledWith(expect.objectContaining({
      inferenceGroupId: selectedGroup.id,
      modelAlias: "selected-chat",
    }));
  });
});

describe("Inference Group deletion", () => {
  it("blocks active consumers and deletes the LiteLLM team after they are removed", async () => {
    const store = new AgentStore();
    const client = adapter({ exists: true, modelCount: 1, complianceDomains: ["CN_MAINLAND"], complianceUnknown: false, capabilities });
    const service = new InferenceGroupService(store, client);
    const group = await service.create(input());
    await service.bindAgent("agent-consumer", group.id);

    await expect(service.delete(group.id)).rejects.toThrow("Remove all Consumers");
    expect(service.get(group.id)).toBeDefined();

    await service.unbindAgent("agent-consumer");
    await service.delete(group.id);

    expect(service.get(group.id)).toBeUndefined();
    expect(client.deleteInferenceGroupTeam).toHaveBeenCalledWith("team-a");
  });
});
