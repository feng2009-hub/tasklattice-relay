import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAgentSchema, createModelProfileSchema } from "@tasklattice/contracts";
import { createTestStore } from "../test/store";
import type { LiteLLMAdminClient, LiteLLMModelProfileInspection } from "../providers/litellm-client";
import { ModelProfileResolver, ModelProfileService } from "./model-profile-service";

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

function adapter(inspection: Omit<LiteLLMModelProfileInspection, "configurationHash"> & { configurationHash?: string }): LiteLLMAdminClient {
  return {
    baseUrl: "http://litellm:4000",
    registerModel: vi.fn(),
    deleteModel: vi.fn(),
    probeModel: vi.fn(),
    createInstanceKey: vi.fn(),
    revokeKey: vi.fn(),
    listSpendLogs: vi.fn(),
    inspectModelProfile: vi.fn(async () => ({ configurationHash: "sha256:litellm", ...inspection })),
    createModelProfileTeam: vi.fn(async () => "team-a"),
    createModelProfileKey: vi.fn(async () => ({ secret: "sk-instance-secret", tokenId: "token-hash" })),
    deleteModelProfileTeam: vi.fn(),
  };
}

function input(domain: "CN_MAINLAND" | "GLOBAL" = "CN_MAINLAND") {
  return createModelProfileSchema.parse({
    name: "Production inference",
    description: "Managed production inference access.",
    gatewayId: "litellm-default",
    publicModelAlias: "production-chat",
    complianceDomain: domain,
    isDefault: true,
  });
}

describe("Model Profile contracts", () => {
  it("keeps model selection out of Instance creation", () => {
    expect(() => createAgentSchema.parse({
      name: "Research Agent",
      description: "",
      runtime: "openshell",
      systemPrompt: "Research the request and report the evidence.",
      modelDeploymentId: "must-be-ignored",
    })).toThrow();
  });

  it("accepts an explicit Model Profile without exposing model routing", () => {
    const modelProfileId = "2f3d37d9-fd85-49ee-80b3-06861b8c44b1";
    expect(createAgentSchema.parse({
      name: "Research Agent",
      description: "",
      runtime: "openshell",
      systemPrompt: "Research the request and report the evidence.",
      modelProfileId,
    }).modelProfileId).toBe(modelProfileId);
  });

  it("defaults secret-safe key and audit policies", () => {
    expect(input()).toMatchObject({
      keyPolicy: { perInstance: true, rotationDays: 90 },
      auditPolicy: { controlPlane: true, requestLogs: true, capturePrompts: false },
    });
  });

  it("accepts concise region-oriented names such as CN", () => {
    expect(createModelProfileSchema.parse({
      ...input(),
      name: "CN",
    }).name).toBe("CN");
  });
});

describe("Model Profile validation", () => {
  it("becomes READY and default only after a matching LiteLLM inspection", async () => {
    const service = new ModelProfileService(createTestStore(), adapter({
      exists: true,
      version: "1.94.1",
      modelCount: 2,
      complianceDomains: ["CN_MAINLAND"],
      complianceUnknown: false,
      capabilities,
    }));
    const profile = await service.create(input());
    expect(profile).toMatchObject({ status: "READY", isDefault: true, capabilities });
    expect(profile.conditions).toContainEqual(expect.objectContaining({ type: "COMPLIANCE", status: "PASS" }));
  });

  it("rejects CN/GLOBAL mixing", async () => {
    const service = new ModelProfileService(createTestStore(), adapter({
      exists: true,
      version: "1.94.1",
      modelCount: 2,
      complianceDomains: ["CN_MAINLAND", "GLOBAL"],
      complianceUnknown: false,
      capabilities,
    }));
    const profile = await service.create(input());
    expect(profile.status).toBe("NON_COMPLIANT");
    expect(profile.isDefault).toBe(false);
  });

  it("rejects a Model Profile that does not match its Gateway compliance domain", async () => {
    vi.stubEnv("LITELLM_COMPLIANCE_DOMAIN", "GLOBAL");
    const client = adapter({
      exists: true,
      version: "1.94.1",
      modelCount: 1,
      complianceDomains: ["CN_MAINLAND"],
      complianceUnknown: false,
      capabilities,
    });
    const service = new ModelProfileService(createTestStore(), client);

    const profile = await service.create(input("CN_MAINLAND"));

    expect(profile.status).toBe("NON_COMPLIANT");
    expect(profile.conditions).toContainEqual(expect.objectContaining({ type: "COMPLIANCE", status: "FAIL" }));
    expect(client.inspectModelProfile).not.toHaveBeenCalled();
  });

  it("fails closed when compliance metadata is UNKNOWN", async () => {
    const service = new ModelProfileService(createTestStore(), adapter({
      exists: true,
      modelCount: 1,
      complianceDomains: [],
      complianceUnknown: true,
      capabilities,
    }));
    const profile = await service.create(input());
    expect(profile.status).toBe("NON_COMPLIANT");
    expect(profile.conditions).toContainEqual(expect.objectContaining({ type: "COMPLIANCE", status: "UNKNOWN" }));
  });

  it("marks unsupported Auto Router versions explicitly", async () => {
    const service = new ModelProfileService(createTestStore(), adapter({
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

describe("ModelProfileResolver", () => {
  it("requires exactly one READY default", async () => {
    const store = createTestStore();
    const service = new ModelProfileService(store, adapter({ exists: true, modelCount: 1, complianceDomains: ["CN_MAINLAND"], complianceUnknown: false, capabilities }));
    const ready = await service.create(input());
    expect((await new ModelProfileResolver(store).resolveDefault()).id).toBe(ready.id);
    await store.saveModelProfile({ ...ready, id: "second", name: "Second default", createdAt: new Date().toISOString() });
    await expect(new ModelProfileResolver(store).resolveDefault()).rejects.toThrow("Multiple default");
  });

  it("does not resolve a suspended profile", async () => {
    const store = createTestStore();
    const service = new ModelProfileService(store, adapter({ exists: true, modelCount: 1, complianceDomains: ["CN_MAINLAND"], complianceUnknown: false, capabilities }));
    const ready = await service.create(input());
    await service.update(ready.id, { suspended: true });
    await expect(service.resolver.resolveDefault()).rejects.toThrow("suspended");
  });

  it("binds an explicitly selected READY profile instead of the default", async () => {
    const store = createTestStore();
    const client = adapter({ exists: true, modelCount: 1, complianceDomains: ["CN_MAINLAND"], complianceUnknown: false, capabilities });
    const service = new ModelProfileService(store, client);
    const defaultProfile = await service.create(input());
    const selectedProfile = await store.saveModelProfile({
      ...defaultProfile,
      id: "2f3d37d9-fd85-49ee-80b3-06861b8c44b1",
      name: "Selected inference",
      publicModelAlias: "selected-chat",
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const binding = await service.bindAgent("agent-selected", selectedProfile.id);

    expect(binding.profile.id).toBe(selectedProfile.id);
    expect(client.createModelProfileKey).toHaveBeenCalledWith(expect.objectContaining({
      modelProfileId: selectedProfile.id,
      modelAlias: "selected-chat",
    }));
  });
});

describe("Model Profile deletion", () => {
  it("blocks active consumers and deletes the LiteLLM team after they are removed", async () => {
    const store = createTestStore();
    const client = adapter({ exists: true, modelCount: 1, complianceDomains: ["CN_MAINLAND"], complianceUnknown: false, capabilities });
    const service = new ModelProfileService(store, client);
    const profile = await service.create(input());
    await service.bindAgent("agent-consumer", profile.id);

    await expect(service.delete(profile.id)).rejects.toThrow("Remove all Consumers");
    expect(await service.get(profile.id)).toBeDefined();

    await service.unbindAgent("agent-consumer");
    await service.delete(profile.id);

    expect(await service.get(profile.id)).toBeUndefined();
    expect(client.deleteModelProfileTeam).toHaveBeenCalledWith("team-a");
  });
});
