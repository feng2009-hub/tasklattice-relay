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
    expect(first).toMatch(/^tali-p-[a-f0-9]{32}$/);
    expect(first).not.toContain("customer-support");
  });

  it("keeps an installation-specific Namespace prefix", () => {
    expect(projectRuntimeNamespace("project-a", "acme-relay-p"))
      .toMatch(/^acme-relay-p-[a-f0-9]{32}$/);
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

  it("refuses a target assigned to another cluster", async () => {
    const config = enabledConfig();
    config.runtime_namespaces.cluster_id = "replacement-cluster";
    setControlConfigForTests(config);
    const db = createTestPrisma();
    await db.projectRuntimeTarget.create({
      data: {
        clusterId: "in-cluster",
        namespace: projectRuntimeNamespace("individual", "tali-p"),
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
        namespace: projectRuntimeNamespace(
          "individual",
          config.runtime_namespaces.name_prefix,
        ),
        projectId: "individual",
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
      config.runtime_namespaces.deletion_timeout_seconds * 1_000,
    );
  });
});

describe("projectNamespaceResource", () => {
  it("includes stable ownership and human-readable Project metadata", () => {
    const resource = projectNamespaceResource({
      namespace: "tali-p-0123456789abcdef0123456789abcdef",
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
        name: "tali-p-0123456789abcdef0123456789abcdef",
      },
    });
  });

  it("uses a stable label fallback for non-Latin Project names", () => {
    expect(projectNameLabel("客户支持")).toMatch(/^project-[a-f0-9]{12}$/);
  });
});
