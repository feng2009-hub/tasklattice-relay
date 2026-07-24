import { describe, expect, it, vi } from "vitest";
import type { LiteLLMAdminClient } from "../providers/litellm-client";
import { createTestPrisma } from "../test/prisma";
import type { SecretStore } from "./secret-store";
import { VirtualEmployeeService } from "./virtual-employee-service";
import { VirtualEmployeeStore } from "./virtual-employee-store";

function adapter(overrides: Partial<LiteLLMAdminClient> = {}): LiteLLMAdminClient {
  return {
    baseUrl: "http://litellm:4000",
    registerModel: vi.fn(),
    deleteModel: vi.fn(),
    probeModel: vi.fn(),
    createInstanceKey: vi.fn(),
    revokeKey: vi.fn(async () => undefined),
    listSpendLogs: vi.fn(async () => []),
    ensureVirtualEmployeeTeam: vi.fn(async () => "team-data"),
    createVirtualEmployeeKey: vi.fn(async () => ({ secret: "sk-virtual-employee-secret", tokenId: "hashed-ve-key" })),
    updateVirtualEmployeeKey: vi.fn(async () => undefined),
    getVirtualEmployeeKey: vi.fn(async () => ({
      tokenId: "hashed-ve-key",
      alias: "tali-individual-jupyter-worker",
      teamId: "team-data",
      models: ["production-chat"],
      maxBudget: 100,
      rpmLimit: 60,
      tpmLimit: 500000,
      blocked: false,
    })),
    disableVirtualEmployeeKey: vi.fn(async () => undefined),
    enableVirtualEmployeeKey: vi.fn(async () => undefined),
    ...overrides,
  };
}

function secretStore(overrides: Partial<SecretStore> = {}): SecretStore {
  let secret = "";
  return {
    put: vi.fn(async (_workspaceId, employeeId, value) => {
      secret = value;
      return `test-secret://${employeeId}`;
    }),
    get: vi.fn(async () => secret),
    delete: vi.fn(async () => { secret = ""; }),
    ...overrides,
  };
}

const input = {
  name: "jupyter-worker",
  displayName: "Jupyter Worker",
  description: "Runs approved analysis workloads.",
  businessRole: "Data Analysis",
  ownerTeamId: "data-platform",
  environment: "production" as const,
  tags: ["analytics"],
  modelAccess: {
    allowedModels: ["production-chat"],
    accessGroups: [],
    maxBudget: 100,
    budgetDuration: "30d",
    rpmLimit: 60,
    tpmLimit: 500000,
    maxParallelRequests: 10,
    keyDuration: "90d",
    fallbackModels: [],
  },
  identities: [],
  accessScopes: [],
  activate: true,
};

describe("VirtualEmployeeService", () => {
  it("provisions a Service Account Key while persisting only its reference and safe metadata", async () => {
    const litellm = adapter();
    const secrets = secretStore();
    const service = new VirtualEmployeeService(
      new VirtualEmployeeStore("individual", createTestPrisma()),
      litellm,
      secrets,
    );

    const employee = await service.create(input, "admin");

    expect(employee.status).toBe("active");
    expect(employee.modelAccess).toMatchObject({
      litellmTeamId: "team-data",
      litellmKeyId: "hashed-ve-key",
      keyLastFour: "cret",
      syncStatus: "synced",
    });
    expect(employee.modelAccess).not.toHaveProperty("secretReference");
    expect(JSON.stringify(employee)).not.toContain("sk-virtual-employee-secret");
    await expect(service.runtimeCredential(employee.id)).resolves.toMatchObject({
      endpoint: "http://litellm:4000/v1",
      key: "sk-virtual-employee-secret",
      model: "production-chat",
    });
  });

  it("preserves the Draft and compensates LiteLLM when Secret storage fails", async () => {
    const litellm = adapter();
    const service = new VirtualEmployeeService(
      new VirtualEmployeeStore("individual", createTestPrisma()),
      litellm,
      secretStore({ put: vi.fn(async () => { throw new Error("Secret storage failed."); }) }),
    );

    const employee = await service.create(input, "admin");

    expect(employee.status).toBe("error");
    expect(employee.modelAccess?.allowedModels).toEqual(["production-chat"]);
    expect(employee.modelAccess?.lastSyncError).toContain("Secret storage failed");
    expect(litellm.revokeKey).toHaveBeenCalledWith("hashed-ve-key");
  });

  it("detects drift without overwriting LiteLLM, then applies intent explicitly", async () => {
    const litellm = adapter({
      getVirtualEmployeeKey: vi.fn(async () => ({
        tokenId: "hashed-ve-key",
        teamId: "team-data",
        models: ["unexpected-model"],
        blocked: false,
      })),
    });
    const service = new VirtualEmployeeService(
      new VirtualEmployeeStore("individual", createTestPrisma()),
      litellm,
      secretStore(),
    );
    const employee = await service.create(input, "admin");

    expect((await service.sync(employee.id, "admin")).modelAccess?.syncStatus).toBe("drifted");
    expect(litellm.updateVirtualEmployeeKey).not.toHaveBeenCalled();
    expect((await service.sync(employee.id, "admin", true)).modelAccess?.syncStatus).toBe("synced");
    expect(litellm.updateVirtualEmployeeKey).toHaveBeenCalled();
  });

  it("disables model access on suspension and blocks deletion while bound", async () => {
    const litellm = adapter();
    const service = new VirtualEmployeeService(
      new VirtualEmployeeStore("individual", createTestPrisma()),
      litellm,
      secretStore(),
    );
    const employee = await service.create(input, "admin");
    await service.bindInstance(employee.id, "instance-a", "admin");

    await expect(service.delete(employee.id, "admin")).rejects.toThrow("in use");
    expect((await service.suspend(employee.id, "admin")).status).toBe("suspended");
    expect(litellm.disableVirtualEmployeeKey).toHaveBeenCalledWith("hashed-ve-key");
  });

  it("reconciles all provisioned employees without overwriting drift", async () => {
    const litellm = adapter({
      getVirtualEmployeeKey: vi.fn(async () => ({
        tokenId: "hashed-ve-key",
        teamId: "team-data",
        models: ["out-of-band-model"],
        blocked: false,
      })),
    });
    const service = new VirtualEmployeeService(
      new VirtualEmployeeStore("individual", createTestPrisma()),
      litellm,
      secretStore(),
    );
    const employee = await service.create(input, "admin");

    await service.reconcileAll();

    expect((await service.get(employee.id)).modelAccess?.syncStatus).toBe("drifted");
    expect(litellm.updateVirtualEmployeeKey).not.toHaveBeenCalled();
  });
});
