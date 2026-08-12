import { describe, expect, it } from "vitest";
import type { Agent } from "@tali/contracts";
import { parseAgent, ProjectStore } from "./project-store";
import { createTestStore } from "../test/store";

const accessPolicyId = "11111111-1111-4111-8111-111111111111";

async function seedAccessPolicy(store: ProjectStore): Promise<void> {
  const now = new Date();
  await store.database().accessPolicyRecord.create({
    data: {
      projectId: store.projectId,
      id: accessPolicyId,
      payload: {
        id: accessPolicyId,
        name: "Default Instance access",
        status: "ACTIVE",
        serverRules: [],
        revision: 1,
        createdBy: "test",
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
      createdAt: now,
      updatedAt: now,
    },
  });
}

describe("ProjectStore", () => {
  it("backfills the personal Project as DEV and defaults new Projects to PROD", async () => {
    const store = createTestStore();
    await expect(
      store.database().project.findUnique({
        where: { id: "individual" },
        select: { authorizationEnvironment: true },
      }),
    ).resolves.toEqual({ authorizationEnvironment: "DEV" });

    await store.database().project.create({
      data: {
        id: "team-project",
        name: "Team Project",
        type: "team",
        createdBy: "local-admin",
      },
    });
    await expect(
      store.database().project.findUnique({
        where: { id: "team-project" },
        select: { authorizationEnvironment: true },
      }),
    ).resolves.toEqual({ authorizationEnvironment: "PROD" });
    await expect(
      store.database().project.update({
        where: { id: "team-project" },
        data: { authorizationEnvironment: "INVALID" },
      }),
    ).rejects.toThrow();
  });

  it("rejects pre-Model-Routing Instance records", () => {
    const now = new Date().toISOString();
    expect(() =>
      parseAgent(
        JSON.stringify({
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
        }),
      ),
    ).toThrow("Stored Instance data is incomplete");
  });

  it("persists the NemoClaw agent resource", async () => {
    const store = createTestStore();
    const now = new Date().toISOString();
    await seedAccessPolicy(store);
    const agent: Agent = {
      schemaVersion: 2,
      id: "a",
      name: "Research",
      description: "",
      runtime: "openshell",
      agentPlatform: "openclaw",
      modelDeploymentId: "model-a",
      providerAccountId: "provider-a",
      providerName: "DeepSeek",
      costKeyAlias: "tali-research-a:deepseek-chat",
      sandboxName: "tali-research-a",
      status: "PROVISIONING",
      model: "deepseek-chat",
      modelType: "llm",
      inferenceMode: "PLATFORM_MANAGED",
      accessPolicyIds: [accessPolicyId],
      modelRoutingId: "routing-a",
      modelRoutingBindingId: "binding-a",
      modelRoutingStatus: "READY",
      modelRoutingComplianceDomain: "CN_MAINLAND",
      modelRoutingCapabilities: {
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
      modelRoutingKeyFingerprint: "sha256:123456789abc",
      policyId: "restricted",
      systemPrompt: "You are a research agent.",
      createdAt: now,
      updatedAt: now,
      logs: [],
    };
    await expect(store.save({ ...agent, id: "ownerless" })).rejects.toThrow(
      "owner user is required",
    );
    await store.save(agent, "local-admin");
    await store.replaceAgentAccessPolicies("a", [accessPolicyId]);
    expect((await store.get("a"))?.runtime).toBe("openshell");
    expect((await store.get("a"))?.accessPolicyIds).toEqual([accessPolicyId]);
    expect(await store.list()).toHaveLength(1);
    await store.database().user.create({
      data: {
        id: "other-owner",
        username: "other-owner",
        email: "other-owner@tasklattice.local",
        displayName: "Other Owner",
      },
    });
    await store.database().projectMember.create({
      data: {
        projectId: store.projectId,
        userId: "other-owner",
        role: "developer",
      },
    });
    await store.save({ ...agent, name: "Research updated" }, "other-owner");
    expect(await store.ownerUserId("a")).toBe("local-admin");
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

  it("isolates records between projects", async () => {
    const store = createTestStore();
    const isolated = new ProjectStore("other-project", store.database());
    const now = new Date().toISOString();
    await seedAccessPolicy(store);
    await store.save({
      schemaVersion: 2,
      id: "current-agent",
      name: "Current research",
      description: "",
      runtime: "openshell",
      agentPlatform: "openclaw",
      modelDeploymentId: "model-a",
      providerAccountId: "provider-a",
      providerName: "DeepSeek",
      costKeyAlias: "tali-current:deepseek-chat",
      sandboxName: "tali-current",
      status: "READY",
      model: "deepseek-chat",
      modelType: "llm",
      inferenceMode: "PLATFORM_MANAGED",
      accessPolicyIds: [accessPolicyId],
      modelRoutingId: "routing-a",
      modelRoutingBindingId: "binding-a",
      modelRoutingStatus: "READY",
      modelRoutingComplianceDomain: "CN_MAINLAND",
      modelRoutingCapabilities: {
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
      modelRoutingKeyFingerprint: "sha256:123456789abc",
      policyId: "restricted",
      systemPrompt: "You are a research agent.",
      createdAt: now,
      updatedAt: now,
      logs: [],
    }, "local-admin");
    await store.replaceAgentAccessPolicies("current-agent", [accessPolicyId]);

    expect((await store.list()).map((agent) => agent.id)).toEqual([
      "current-agent",
    ]);
    expect(await isolated.get("current-agent")).toBeUndefined();
    expect(
      (await store.listAgentsForReporting()).map((agent) => agent.id),
    ).toEqual(["current-agent"]);
    expect(await store.isSandboxPolicyInUse("legacy-policy")).toBe(false);
  });
});
