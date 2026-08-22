import { afterEach, describe, expect, it, vi } from "vitest";
import {
  developmentControlConfig,
  setControlConfigForTests,
} from "../config/control-config";
import {
  projectNamespaceResources,
  type ProjectNamespaceClient,
} from "../kubernetes/project-namespace-client";
import { createTestPrisma } from "../test/prisma";
import {
  projectRuntimeNamespace,
  ProjectRuntimeTargetService,
} from "./project-runtime-target-service";

function enabledConfig() {
  const config = developmentControlConfig();
  config.runtime_namespaces.enabled = true;
  return config;
}

function namespaceClient(input?: {
  reconcileError?: Error;
}) {
  const reconcile = vi.fn(async () => {
    if (input?.reconcileError) throw input.reconcileError;
  });
  const deleteAndWait = vi.fn(async () => undefined);
  return {
    client: { reconcile, deleteAndWait } as ProjectNamespaceClient,
    deleteAndWait,
    reconcile,
  };
}

afterEach(() => {
  setControlConfigForTests(undefined);
});

describe("ProjectRuntimeTargetService", () => {
  it("generates stable opaque DNS-safe Namespace names", () => {
    setControlConfigForTests(enabledConfig());
    const first = projectRuntimeNamespace("customer-support-12345678");
    const second = projectRuntimeNamespace("customer-support-12345678");
    expect(first).toBe(second);
    expect(first).toMatch(/^tali-p-[a-f0-9]{32}$/);
    expect(first).not.toContain("customer-support");
  });

  it("reconciles a pending target and records the observed generation", async () => {
    const config = enabledConfig();
    setControlConfigForTests(config);
    const db = createTestPrisma();
    const fake = namespaceClient();
    const service = new ProjectRuntimeTargetService(db, fake.client);

    const result = await service.processNext(
      "runtime-worker-a",
      new Date("2099-08-22T00:00:00.000Z"),
    );

    expect(result).toMatchObject({ projectId: "individual", status: "ready" });
    expect(fake.reconcile).toHaveBeenCalledWith(expect.objectContaining({
      namespace: projectRuntimeNamespace("individual"),
      projectId: "individual",
      runtimeNamespaces: config.runtime_namespaces,
    }));
    await expect(db.projectRuntimeTarget.findUnique({
      where: { projectId: "individual" },
    })).resolves.toMatchObject({
      attempts: 0,
      generation: 1,
      observedGeneration: 1,
      status: "ready",
    });
  });

  it("keeps failed reconciliation work retryable", async () => {
    setControlConfigForTests(enabledConfig());
    const db = createTestPrisma();
    const fake = namespaceClient({
      reconcileError: new Error("Kubernetes API unavailable"),
    });
    const service = new ProjectRuntimeTargetService(db, fake.client);

    const result = await service.processNext(
      "runtime-worker-a",
      new Date("2099-08-22T00:00:00.000Z"),
    );

    expect(result).toMatchObject({
      error: "Kubernetes API unavailable",
      projectId: "individual",
      status: "retry",
    });
    await expect(db.projectRuntimeTarget.findUnique({
      where: { projectId: "individual" },
    })).resolves.toMatchObject({
      attempts: 1,
      lastError: "Kubernetes API unavailable",
      status: "retry",
    });
  });

  it("refuses to reconcile a target assigned to another cluster", async () => {
    const config = enabledConfig();
    config.runtime_namespaces.cluster_id = "replacement-cluster";
    setControlConfigForTests(config);
    const db = createTestPrisma();
    const fake = namespaceClient();
    const service = new ProjectRuntimeTargetService(db, fake.client);

    await expect(service.processNext(
      "runtime-worker-a",
      new Date("2099-08-22T00:00:00.000Z"),
    )).resolves.toMatchObject({
      error: expect.stringContaining("belongs to cluster in-cluster"),
      status: "retry",
    });
    expect(fake.reconcile).not.toHaveBeenCalled();
  });

  it("periodically reconciles ready targets to repair drift", async () => {
    const config = enabledConfig();
    setControlConfigForTests(config);
    const db = createTestPrisma();
    const fake = namespaceClient();
    const service = new ProjectRuntimeTargetService(db, fake.client);
    const firstReconcile = new Date("2099-08-22T00:00:00.000Z");

    await expect(service.processNext("runtime-worker-a", firstReconcile))
      .resolves.toMatchObject({ status: "ready" });
    await expect(service.processNext(
      "runtime-worker-a",
      new Date(firstReconcile.getTime() + 1_000),
    )).resolves.toEqual({ status: "idle" });
    await expect(service.processNext(
      "runtime-worker-a",
      new Date(
        firstReconcile.getTime() +
          config.runtime_namespaces.resync_interval_seconds * 1_000,
      ),
    )).resolves.toMatchObject({ status: "ready" });
    expect(fake.reconcile).toHaveBeenCalledTimes(2);
  });

  it("waits for the Project Namespace to disappear during cleanup", async () => {
    const config = enabledConfig();
    setControlConfigForTests(config);
    const db = createTestPrisma();
    const fake = namespaceClient();
    const service = new ProjectRuntimeTargetService(db, fake.client);

    await expect(service.deleteProjectNamespace("individual")).resolves.toBe(true);
    expect(fake.deleteAndWait).toHaveBeenCalledWith(
      projectRuntimeNamespace("individual"),
      "individual",
      config.runtime_namespaces.deletion_timeout_seconds * 1_000,
    );
  });
});

describe("projectNamespaceResources", () => {
  it("builds the Namespace isolation baseline without a custom resource", () => {
    const config = enabledConfig();
    const resources = projectNamespaceResources({
      namespace: "tali-p-0123456789abcdef0123456789abcdef",
      platformNamespace: "tali",
      projectId: "project-a",
      runtimeNamespaces: config.runtime_namespaces,
    });

    expect(resources.map(({ kind }) => kind)).toEqual([
      "Namespace",
      "ServiceAccount",
      "LimitRange",
      "ResourceQuota",
      "NetworkPolicy",
      "NetworkPolicy",
      "NetworkPolicy",
      "NetworkPolicy",
    ]);
    expect(resources).toContainEqual(expect.objectContaining({
      kind: "NetworkPolicy",
      metadata: expect.objectContaining({ name: "tali-default-deny" }),
    }));
    expect(resources).toContainEqual(expect.objectContaining({
      kind: "NetworkPolicy",
      metadata: expect.objectContaining({ name: "tali-allow-project" }),
    }));
    expect(resources).toContainEqual(expect.objectContaining({
      automountServiceAccountToken: false,
      kind: "ServiceAccount",
      metadata: expect.objectContaining({ name: "tali-agent-runtime" }),
    }));
    expect(resources).toContainEqual(expect.objectContaining({
      kind: "ResourceQuota",
      spec: expect.objectContaining({
        hard: expect.objectContaining({ pods: "50" }),
      }),
    }));
  });
});
