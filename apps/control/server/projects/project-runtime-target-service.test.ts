import { afterEach, describe, expect, it, vi } from "vitest";
import {
  developmentControlConfig,
  setControlConfigForTests,
} from "../config/control-config";
import {
  projectNameLabel,
  projectNamespaceResource,
  type ProjectNamespaceClient,
} from "../kubernetes/project-namespace-client";
import { createTestPrisma } from "../test/prisma";
import {
  OPENSHELL_ROUTABLE_NAME_MAX_LENGTH,
  PROJECT_RUNTIME_NAMESPACE_PREFIX,
  projectRuntimeNamespace,
  ProjectRuntimeTargetService,
} from "./project-runtime-target-service";

function enabledConfig() {
  const config = developmentControlConfig();
  config.runtime_namespaces.enabled = true;
  return config;
}

function namespaceClient(input?: { reconcileError?: Error }) {
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
    expect(first).toMatch(/^tp-[a-z2-7]{16}$/);
    expect(first).toHaveLength(OPENSHELL_ROUTABLE_NAME_MAX_LENGTH);
    expect(first.startsWith(PROJECT_RUNTIME_NAMESPACE_PREFIX)).toBe(true);
    expect(first).not.toContain("customer-support");
  });

  it("gives distinct Projects distinct OpenShell-compatible names", () => {
    expect(projectRuntimeNamespace("project-a"))
      .not.toBe(projectRuntimeNamespace("project-b"));
  });

  it("ensures one Namespace synchronously and records readiness", async () => {
    setControlConfigForTests(enabledConfig());
    const db = createTestPrisma();
    const fake = namespaceClient();
    const service = new ProjectRuntimeTargetService(db, fake.client);

    await expect(
      service.ensureProjectNamespace("individual"),
    ).resolves.toBe(true);

    expect(fake.reconcile).toHaveBeenCalledWith({
      namespace: projectRuntimeNamespace("individual"),
      projectId: "individual",
      projectName: "admin",
    });
    await expect(db.projectRuntimeTarget.findUnique({
      where: { projectId: "individual" },
    })).resolves.toMatchObject({
      observedGeneration: 1,
      status: "ready",
    });
  });

  it("records a failed synchronous ensure without scheduling retries", async () => {
    setControlConfigForTests(enabledConfig());
    const db = createTestPrisma();
    const fake = namespaceClient({
      reconcileError: new Error("Kubernetes API unavailable"),
    });
    const service = new ProjectRuntimeTargetService(db, fake.client);

    await expect(service.ensureProjectNamespace("individual")).rejects.toThrow(
      "Kubernetes API unavailable",
    );
    await expect(db.projectRuntimeTarget.findUnique({
      where: { projectId: "individual" },
    })).resolves.toMatchObject({
      lastError: "Kubernetes API unavailable",
      status: "retry",
    });
  });

  it("does not overlap an active reconciliation lease", async () => {
    setControlConfigForTests(enabledConfig());
    const db = createTestPrisma();
    await db.projectRuntimeTarget.create({
      data: {
        clusterId: "in-cluster",
        leaseExpiresAt: new Date(Date.now() + 60_000),
        leaseOwner: "another-reconciler",
        namespace: projectRuntimeNamespace("individual"),
        projectId: "individual",
        status: "reconciling",
      },
    });
    const fake = namespaceClient();
    const service = new ProjectRuntimeTargetService(db, fake.client);

    await expect(service.ensureProjectNamespace("individual")).rejects.toThrow(
      "changed or started deleting",
    );
    expect(fake.reconcile).not.toHaveBeenCalled();
    await expect(db.projectRuntimeTarget.findUnique({
      where: { projectId: "individual" },
    })).resolves.toMatchObject({
      leaseOwner: "another-reconciler",
      status: "reconciling",
    });
  });

  it("refuses a target assigned to another cluster", async () => {
    const config = enabledConfig();
    config.runtime_namespaces.cluster_id = "replacement-cluster";
    setControlConfigForTests(config);
    const db = createTestPrisma();
    await db.projectRuntimeTarget.create({
      data: {
        clusterId: "in-cluster",
        namespace: projectRuntimeNamespace("individual"),
        projectId: "individual",
      },
    });
    const fake = namespaceClient();
    const service = new ProjectRuntimeTargetService(db, fake.client);

    await expect(service.ensureProjectNamespace("individual")).rejects.toThrow(
      "belongs to cluster in-cluster",
    );
    expect(fake.reconcile).not.toHaveBeenCalled();
  });

  it("runs a complete manual reconciliation once and exits", async () => {
    setControlConfigForTests(enabledConfig());
    const db = createTestPrisma();
    const fake = namespaceClient();
    const service = new ProjectRuntimeTargetService(db, fake.client);

    await expect(service.reconcileAll()).resolves.toEqual({
      failed: 0,
      failures: [],
      ready: 1,
      skipped: 0,
      total: 1,
    });
    expect(fake.reconcile).toHaveBeenCalledTimes(1);
  });

  it("waits for the Project Namespace to disappear during cleanup", async () => {
    const config = enabledConfig();
    setControlConfigForTests(config);
    const db = createTestPrisma();
    await db.projectRuntimeTarget.create({
      data: {
        clusterId: config.runtime_namespaces.cluster_id,
        namespace: projectRuntimeNamespace("individual"),
        projectId: "individual",
      },
    });
    await db.platformSettingsRecord.create({
      data: {
        id: "platform",
        runtimeNamespaceDeletionTimeoutSeconds: 37,
      },
    });
    const fake = namespaceClient();
    const service = new ProjectRuntimeTargetService(db, fake.client);

    await expect(
      service.deleteProjectNamespace("individual"),
    ).resolves.toBe(true);
    expect(fake.deleteAndWait).toHaveBeenCalledWith(
      projectRuntimeNamespace("individual"),
      "individual",
      37_000,
    );
  });
});

describe("projectNamespaceResource", () => {
  it("includes stable ownership and human-readable Project metadata", () => {
    const namespace = projectRuntimeNamespace("project-a");
    const resource = projectNamespaceResource({
      namespace,
      projectId: "project-a",
      projectName: "Customer Support",
    });

    expect(resource).toMatchObject({
      apiVersion: "v1",
      kind: "Namespace",
      metadata: {
        annotations: {
          "tali.io/project-id": "project-a",
          "tali.io/project-name": "Customer Support",
        },
        labels: {
          "app.kubernetes.io/managed-by": "tali",
          "app.kubernetes.io/part-of": "tali",
          "tali.io/project-name": "customer-support",
          "tali.io/runtime-target": "true",
        },
        name: namespace,
      },
    });
  });

  it("uses a stable label fallback for non-Latin Project names", () => {
    expect(projectNameLabel("客户支持")).toMatch(/^project-[a-f0-9]{12}$/);
  });
});
