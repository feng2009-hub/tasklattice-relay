import { PatchStrategy, type V1Namespace } from "@kubernetes/client-node";
import { describe, expect, it, vi } from "vitest";
import { KubernetesProjectNamespaceClient } from "./project-namespace-client";

function apiError(code: number, message: string) {
  return { body: { message }, code };
}

function namespace(projectId: string, uid = "namespace-uid"): V1Namespace {
  return {
    apiVersion: "v1",
    kind: "Namespace",
    metadata: {
      annotations: { "tali.io/project-id": projectId },
      name: "acme-relay-p-0123456789abcdef0123456789abcdef",
      uid,
    },
  };
}

function client(input?: {
  createNamespace?: ReturnType<typeof vi.fn>;
  deleteNamespace?: ReturnType<typeof vi.fn>;
  patch?: ReturnType<typeof vi.fn>;
  readNamespace?: ReturnType<typeof vi.fn>;
}) {
  const core = {
    createNamespace: input?.createNamespace ?? vi.fn(async () => namespace("project-a")),
    deleteNamespace: input?.deleteNamespace ?? vi.fn(async () => ({})),
    readNamespace: input?.readNamespace ?? vi.fn(async () => namespace("project-a")),
  };
  const objects = {
    patch: input?.patch ?? vi.fn(async () => namespace("project-a")),
  };
  return {
    client: new KubernetesProjectNamespaceClient(
      core as never,
      objects as never,
    ),
    core,
    objects,
  };
}

const input = {
  namespace: "acme-relay-p-0123456789abcdef0123456789abcdef",
  projectId: "project-a",
};

describe("KubernetesProjectNamespaceClient", () => {
  it("creates a missing Namespace through the typed Core API", async () => {
    const fake = client({
      readNamespace: vi.fn(async () => {
        throw apiError(404, "not found");
      }),
    });

    await expect(fake.client.reconcile(input)).resolves.toBeUndefined();

    expect(fake.core.createNamespace).toHaveBeenCalledWith({
      body: expect.objectContaining({
        apiVersion: "v1",
        kind: "Namespace",
        metadata: expect.objectContaining({
          annotations: { "tali.io/project-id": "project-a" },
          name: input.namespace,
        }),
      }),
    });
    expect(fake.objects.patch).not.toHaveBeenCalled();
  });

  it("server-side applies only Relay metadata to an owned Namespace", async () => {
    const fake = client();

    await expect(fake.client.reconcile(input)).resolves.toBeUndefined();

    expect(fake.objects.patch).toHaveBeenCalledWith(
      expect.objectContaining({
        apiVersion: "v1",
        kind: "Namespace",
        metadata: expect.objectContaining({ name: input.namespace }),
      }),
      undefined,
      undefined,
      "tali-project-runtime-controller",
      false,
      PatchStrategy.ServerSideApply,
    );
  });

  it("refuses to adopt an existing Namespace owned by another Project", async () => {
    const fake = client({
      readNamespace: vi.fn(async () => namespace("project-b")),
    });

    await expect(fake.client.reconcile(input)).rejects.toThrow(
      "found Project project-b",
    );
    expect(fake.objects.patch).not.toHaveBeenCalled();
  });

  it("checks ownership after a concurrent create conflict", async () => {
    const readNamespace = vi
      .fn()
      .mockRejectedValueOnce(apiError(404, "not found"))
      .mockResolvedValueOnce(namespace("project-b"));
    const fake = client({
      createNamespace: vi.fn(async () => {
        throw apiError(409, "already exists");
      }),
      readNamespace,
    });

    await expect(fake.client.reconcile(input)).rejects.toThrow(
      "found Project project-b",
    );
    expect(fake.objects.patch).not.toHaveBeenCalled();
  });

  it("deletes with a Namespace UID precondition", async () => {
    const readNamespace = vi
      .fn()
      .mockResolvedValueOnce(namespace("project-a", "uid-a"))
      .mockRejectedValueOnce(apiError(404, "not found"));
    const fake = client({ readNamespace });

    await expect(
      fake.client.deleteAndWait(input.namespace, input.projectId, 10_000),
    ).resolves.toBeUndefined();

    expect(fake.core.deleteNamespace).toHaveBeenCalledWith({
      body: {
        apiVersion: "v1",
        kind: "DeleteOptions",
        preconditions: { uid: "uid-a" },
      },
      name: input.namespace,
    });
  });
});
