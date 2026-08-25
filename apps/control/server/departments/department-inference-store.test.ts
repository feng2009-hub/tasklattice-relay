import { describe, expect, it } from "vitest";
import type {
  ModelDeployment,
  ModelRouting,
  ProviderAccount,
} from "@tali/contracts";
import { ProjectStore } from "../projects/project-store";
import { createTestPrisma } from "../test/prisma";
import { DepartmentInferenceStore } from "./department-inference-store";

const modelId = "11111111-1111-4111-8111-111111111111";
const routingId = "22222222-2222-4222-8222-222222222222";
const replacementModelId = "44444444-4444-4444-8444-444444444444";

function provider(now: string): ProviderAccount {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Department OpenAI",
    providerKind: "custom-openai-compatible",
    presetId: "custom-openai-compatible",
    endpoint: "https://models.department.test/v1",
    config: {},
    complianceDomain: "GLOBAL",
    endpointRegion: "global-test-1",
    crossBorderTransfer: false,
    discoveredModels: ["department-chat"],
    status: "VALIDATED",
    checks: [],
    credentialState: "STORED",
    validationMessage: "Ready",
    validatedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

function model(now: string, displayName = "Department Chat"): ModelDeployment {
  return {
    id: modelId,
    providerAccountId: provider(now).id,
    modelId: "department-chat",
    displayName,
    modelType: "llm",
    capabilities: ["reasoning", "tool-calling"],
    inputModalities: ["text"],
    outputModalities: ["text"],
    providerPresetId: "custom-openai-compatible",
    providerName: "Department OpenAI",
    endpoint: "https://models.department.test/v1",
    complianceDomain: "GLOBAL",
    endpointRegion: "global-test-1",
    crossBorderTransfer: false,
    litellmModelName: "department-chat",
    status: "VALIDATED",
    checks: [],
    validationMessage: "Ready",
    validatedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

function routing(now: string, description = "Shared Department route"): ModelRouting {
  return {
    id: routingId,
    name: "Department production",
    description,
    gatewayId: "litellm-default",
    managementMode: "LITELLM_MANAGED",
    publicModelAlias: "department-production",
    routingPolicy: {
      version: 1,
      mode: "SINGLE",
      modelDeploymentId: modelId,
      fallbackModelDeploymentIds: [],
      retries: 2,
    },
    complianceDomain: "GLOBAL",
    status: "READY",
    isDefault: false,
    keyPolicy: { perInstance: true, rotationDays: 90 },
    auditPolicy: {
      controlPlane: true,
      requestLogs: true,
      capturePrompts: false,
    },
    capabilities: {
      automaticRouting: "DISABLED",
      routerType: "OTHER",
      sessionAffinity: "UNKNOWN",
      adaptiveRouting: "UNKNOWN",
      failover: "DISABLED",
      generalFallback: "DISABLED",
      contextWindowFallback: "UNKNOWN",
      contentPolicyFallback: "UNKNOWN",
      retries: "ENABLED",
      requestAudit: "ENABLED",
    },
    conditions: [],
    configurationHash: "sha256:department-route",
    observedGeneration: 1,
    validationMessage: "Ready",
    consumers: 0,
    lastSynchronizedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

describe("Department inference inheritance", () => {
  it("keeps Project inheritance read-only and resolves current Department data by ID", async () => {
    const db = createTestPrisma();
    const department = new DepartmentInferenceStore("dep1", db);
    const project = new ProjectStore("individual", db);
    const now = new Date().toISOString();

    await department.saveProviderAccount(provider(now), "department-secret");
    await department.saveModelDeployment(model(now));
    await department.saveModelRouting(routing(now));

    await project.inheritDepartmentRouting(routingId);

    expect(await project.getModelDeployment(modelId)).toMatchObject({
      displayName: "Department Chat",
      origin: {
        scope: "DEPARTMENT",
        inherited: true,
        editable: false,
      },
    });
    expect(await project.getModelRouting(routingId)).toMatchObject({
      description: "Shared Department route",
      origin: {
        scope: "DEPARTMENT",
        inherited: true,
        editable: false,
      },
    });

    await department.saveModelDeployment(model(now, "Department Chat v2"));
    await department.saveModelRouting(routing(now, "Updated centrally"));

    expect((await project.getModelDeployment(modelId))?.displayName).toBe(
      "Department Chat v2",
    );
    expect((await project.getModelRouting(routingId))?.description).toBe(
      "Updated centrally",
    );
    await department.saveModelDeployment({
      ...model(now, "Department Chat Next"),
      id: replacementModelId,
      modelId: "department-chat-next",
      litellmModelName: "department-chat-next",
    });
    await department.saveModelRouting({
      ...routing(now, "Updated model centrally"),
      routingPolicy: {
        version: 1,
        mode: "SINGLE",
        modelDeploymentId: replacementModelId,
        fallbackModelDeploymentIds: [],
        retries: 2,
      },
    });
    expect((await project.getModelRouting(routingId))?.routingPolicy).toMatchObject({
      modelDeploymentId: replacementModelId,
    });
    expect(await project.getModelDeployment(replacementModelId)).toMatchObject({
      displayName: "Department Chat Next",
      origin: { inherited: true, editable: false },
    });
    expect(await project.getModelDeployment(modelId)).toBeUndefined();
    await expect(
      project.saveModelRouting({
        ...(await project.getModelRouting(routingId))!,
        name: "Project override",
      }),
    ).rejects.toThrow("read-only");
    await expect(department.deleteModelRouting(routingId)).rejects.toThrow(
      "inherited Routing",
    );
  });

  it("lets a Project choose an inherited Routing as its default without changing the Department", async () => {
    const db = createTestPrisma();
    const department = new DepartmentInferenceStore("dep1", db);
    const project = new ProjectStore("individual", db);
    const now = new Date().toISOString();

    await department.saveProviderAccount(provider(now), "department-secret");
    await department.saveModelDeployment(model(now));
    await department.saveModelRouting(routing(now));
    const inherited = await project.inheritDepartmentRouting(routingId);

    await project.saveDefaultModelRouting({ ...inherited, isDefault: true });
    await project.saveModelRoutingRuntime({
      ...(await project.getModelRouting(routingId))!,
      liteLLMTeamId: "team-project-individual",
    });

    expect((await project.getModelRouting(routingId))?.isDefault).toBe(true);
    expect((await project.getModelRouting(routingId))?.liteLLMTeamId).toBe(
      "team-project-individual",
    );
    expect((await department.getModelRouting(routingId))?.isDefault).toBe(false);
    expect((await department.getModelRouting(routingId))?.liteLLMTeamId).toBeUndefined();
  });
});
