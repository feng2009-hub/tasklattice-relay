import { PatchStrategy, type V1Deployment, type V1Service } from "@kubernetes/client-node";
import { describe, expect, it, vi } from "vitest";
import {
  KubernetesManagedAgentRuntimeClient,
  managedAgentEndpoint,
  managedAgentResourceName,
  pinnedImageReference,
  type ManagedAgentRuntimeInput,
} from "./managed-agent-runtime-client";

const input: ManagedAgentRuntimeInput = {
  sourceType: "container-image",
  agentId: "agent-research-a",
  projectId: "project-a",
  namespace: "tali-p-0123456789abcdef0123456789abcdef",
  name: "Research Agent",
  description: "Handles delegated research and source validation tasks.",
  category: "Research",
  owner: "Research Platform",
  tags: ["Research"],
  usageMode: "CALLABLE",
  image: "ghcr.io/acme/research-agent:v1.4.0",
  containerPort: 8_080,
  agentCardPath: "/.well-known/agent-card.json",
  imagePullSecretName: "registry-credentials",
  command: [],
  args: [],
};

function notFound(): never {
  throw { code: 404 };
}

function readyDeployment(): V1Deployment {
  return {
    metadata: { generation: 1 },
    status: { availableReplicas: 1, observedGeneration: 1 },
  };
}

describe("KubernetesManagedAgentRuntimeClient", () => {
  it("deploys a hardened service and pins the resolved image digest", async () => {
    const apps = {
      readNamespacedDeployment: vi.fn()
        .mockImplementationOnce(notFound)
        .mockResolvedValue(readyDeployment())
        .mockResolvedValue(readyDeployment()),
      deleteNamespacedDeployment: vi.fn(async () => ({})),
    };
    const core = {
      readNamespacedService: vi.fn(notFound),
      listNamespacedPod: vi.fn(async () => ({
        items: [{
          status: {
            containerStatuses: [{
              name: "agent",
              ready: true,
              imageID: "docker-pullable://ghcr.io/acme/research-agent@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            }],
          },
        }],
      })),
      deleteNamespacedService: vi.fn(async () => ({})),
    };
    const objects = {
      patch: vi.fn(async (_resource: V1Deployment | V1Service) => ({})),
    };
    const client = new KubernetesManagedAgentRuntimeClient(
      apps as never,
      core as never,
      objects as never,
      100,
      1,
    );

    const result = await client.onboard(input);

    const resources = objects.patch.mock.calls.map(([resource]) => resource);
    const service = resources.find((resource) => resource.kind === "Service") as V1Service;
    const deployments = resources.filter((resource) => resource.kind === "Deployment") as V1Deployment[];
    expect(service).toMatchObject({
      metadata: {
        namespace: input.namespace,
        annotations: {
          "tali.io/agent-id": input.agentId,
          "tali.io/project-id": input.projectId,
        },
      },
      spec: { type: "ClusterIP", ports: [{ port: 8_080, targetPort: "http" }] },
    });
    expect(deployments).toHaveLength(2);
    expect(deployments[0]?.spec?.template.spec).toMatchObject({
      automountServiceAccountToken: false,
      imagePullSecrets: [{ name: "registry-credentials" }],
      securityContext: { seccompProfile: { type: "RuntimeDefault" } },
      containers: [{
        image: input.image,
        imagePullPolicy: "Always",
        securityContext: {
          allowPrivilegeEscalation: false,
          capabilities: { drop: ["ALL"] },
        },
      }],
    });
    expect(deployments[1]?.spec?.template.spec?.containers?.[0]).toMatchObject({
      image: "ghcr.io/acme/research-agent@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      imagePullPolicy: "IfNotPresent",
    });
    expect(objects.patch).toHaveBeenCalledWith(
      expect.anything(),
      undefined,
      undefined,
      "tali-control-managed-agent",
      false,
      PatchStrategy.ServerSideApply,
    );
    expect(result).toMatchObject({
      endpoint: managedAgentEndpoint(
        input.namespace,
        managedAgentResourceName(input.agentId),
        input.containerPort,
      ),
      imageDigest: "ghcr.io/acme/research-agent@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
  });

  it("refuses to adopt a resource with different ownership metadata", async () => {
    const apps = {
      readNamespacedDeployment: vi.fn(async () => ({
        metadata: {
          name: managedAgentResourceName(input.agentId),
          annotations: {
            "tali.io/agent-id": "another-agent",
            "tali.io/project-id": input.projectId,
          },
        },
      })),
      deleteNamespacedDeployment: vi.fn(),
    };
    const core = {
      readNamespacedService: vi.fn(notFound),
      listNamespacedPod: vi.fn(),
      deleteNamespacedService: vi.fn(),
    };
    const objects = { patch: vi.fn() };
    const client = new KubernetesManagedAgentRuntimeClient(
      apps as never,
      core as never,
      objects as never,
    );

    await expect(client.onboard(input)).rejects.toThrow("ownership metadata");
    expect(objects.patch).not.toHaveBeenCalled();
  });

  it("deletes only resources owned by the Project Agent", async () => {
    const name = managedAgentResourceName(input.agentId);
    const ownership = {
      "tali.io/agent-id": input.agentId,
      "tali.io/project-id": input.projectId,
    };
    const apps = {
      readNamespacedDeployment: vi.fn(async () => ({
        metadata: { name, annotations: ownership },
      })),
      deleteNamespacedDeployment: vi.fn(async () => ({})),
    };
    const core = {
      readNamespacedService: vi.fn(async () => ({
        metadata: { name, annotations: ownership },
      })),
      listNamespacedPod: vi.fn(),
      deleteNamespacedService: vi.fn(async () => ({})),
    };
    const client = new KubernetesManagedAgentRuntimeClient(
      apps as never,
      core as never,
      { patch: vi.fn() } as never,
    );

    await client.remove({
      agentId: input.agentId,
      namespace: input.namespace,
      projectId: input.projectId,
    });

    expect(apps.deleteNamespacedDeployment).toHaveBeenCalledWith({
      name,
      namespace: input.namespace,
      propagationPolicy: "Foreground",
    });
    expect(core.deleteNamespacedService).toHaveBeenCalledWith({
      name,
      namespace: input.namespace,
    });
  });
});

describe("pinnedImageReference", () => {
  it("preserves the requested repository while replacing a mutable tag", () => {
    expect(pinnedImageReference(
      "registry.example.com:5000/team/agent:latest",
      "containerd://registry.example.com:5000/team/agent@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    )).toBe(
      "registry.example.com:5000/team/agent@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    );
  });

  it("keeps an already immutable image reference", () => {
    const image = "ghcr.io/acme/agent@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
    expect(pinnedImageReference(image, undefined)).toBe(image);
  });
});
