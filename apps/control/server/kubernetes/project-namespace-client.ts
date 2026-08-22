import { readFile } from "node:fs/promises";
import type { ControlConfig } from "../config/control-config";

export interface ProjectNamespaceInput {
  namespace: string;
  platformNamespace: string;
  projectId: string;
  runtimeNamespaces: ControlConfig["runtime_namespaces"];
}

export interface ProjectNamespaceClient {
  reconcile(input: ProjectNamespaceInput): Promise<void>;
  deleteAndWait(
    namespace: string,
    projectId: string,
    timeoutMs: number,
  ): Promise<void>;
}

interface KubernetesResource {
  apiVersion: string;
  kind: string;
  metadata: {
    annotations?: Record<string, string>;
    labels?: Record<string, string>;
    name: string;
    namespace?: string;
  };
  [key: string]: unknown;
}

interface KubernetesNamespace {
  metadata?: {
    annotations?: Record<string, string>;
    uid?: string;
  };
}

function managedLabels(): Record<string, string> {
  return {
    "app.kubernetes.io/managed-by": "tali",
    "app.kubernetes.io/part-of": "tali",
    "tali.io/runtime-target": "true",
  };
}

export function projectNamespaceResources(
  input: ProjectNamespaceInput,
): KubernetesResource[] {
  const { namespace, platformNamespace, projectId, runtimeNamespaces } = input;
  const resources: KubernetesResource[] = [
    {
      apiVersion: "v1",
      kind: "Namespace",
      metadata: {
        name: namespace,
        labels: managedLabels(),
        annotations: { "tali.io/project-id": projectId },
      },
    },
    {
      apiVersion: "v1",
      kind: "ServiceAccount",
      metadata: {
        name: "tali-agent-runtime",
        namespace,
        labels: managedLabels(),
      },
      automountServiceAccountToken: false,
    },
    {
      apiVersion: "v1",
      kind: "LimitRange",
      metadata: {
        name: "tali-default-limits",
        namespace,
        labels: managedLabels(),
      },
      spec: {
        limits: [
          {
            type: "Container",
            defaultRequest: {
              cpu: runtimeNamespaces.limit_range.default_request_cpu,
              memory: runtimeNamespaces.limit_range.default_request_memory,
            },
            default: {
              cpu: runtimeNamespaces.limit_range.default_cpu,
              memory: runtimeNamespaces.limit_range.default_memory,
            },
          },
        ],
      },
    },
  ];

  if (runtimeNamespaces.resource_quota.enabled) {
    resources.push({
      apiVersion: "v1",
      kind: "ResourceQuota",
      metadata: {
        name: "tali-project-quota",
        namespace,
        labels: managedLabels(),
      },
      spec: {
        hard: {
          pods: String(runtimeNamespaces.resource_quota.pods),
          services: String(runtimeNamespaces.resource_quota.services),
          persistentvolumeclaims: String(
            runtimeNamespaces.resource_quota.persistent_volume_claims,
          ),
          "requests.cpu": runtimeNamespaces.resource_quota.requests_cpu,
          "requests.memory": runtimeNamespaces.resource_quota.requests_memory,
          "requests.storage": runtimeNamespaces.resource_quota.requests_storage,
          "limits.cpu": runtimeNamespaces.resource_quota.limits_cpu,
          "limits.memory": runtimeNamespaces.resource_quota.limits_memory,
        },
      },
    });
  }

  if (runtimeNamespaces.network_policy.default_deny) {
    resources.push(
      {
        apiVersion: "networking.k8s.io/v1",
        kind: "NetworkPolicy",
        metadata: {
          name: "tali-default-deny",
          namespace,
          labels: managedLabels(),
        },
        spec: {
          podSelector: {},
          policyTypes: ["Ingress", "Egress"],
        },
      },
      {
        apiVersion: "networking.k8s.io/v1",
        kind: "NetworkPolicy",
        metadata: {
          name: "tali-allow-project",
          namespace,
          labels: managedLabels(),
        },
        spec: {
          podSelector: {},
          policyTypes: ["Ingress", "Egress"],
          ingress: [{ from: [{ podSelector: {} }] }],
          egress: [{ to: [{ podSelector: {} }] }],
        },
      },
      {
        apiVersion: "networking.k8s.io/v1",
        kind: "NetworkPolicy",
        metadata: {
          name: "tali-allow-dns",
          namespace,
          labels: managedLabels(),
        },
        spec: {
          podSelector: {},
          policyTypes: ["Egress"],
          egress: [
            {
              ports: [
                { port: 53, protocol: "UDP" },
                { port: 53, protocol: "TCP" },
              ],
            },
          ],
        },
      },
      {
        apiVersion: "networking.k8s.io/v1",
        kind: "NetworkPolicy",
        metadata: {
          name: "tali-allow-platform",
          namespace,
          labels: managedLabels(),
        },
        spec: {
          podSelector: {},
          policyTypes: ["Ingress", "Egress"],
          ingress: [
            {
              from: [
                {
                  namespaceSelector: {
                    matchLabels: {
                      "kubernetes.io/metadata.name": platformNamespace,
                    },
                  },
                },
              ],
            },
          ],
          egress: [
            {
              to: [
                {
                  namespaceSelector: {
                    matchLabels: {
                      "kubernetes.io/metadata.name": platformNamespace,
                    },
                  },
                },
              ],
            },
          ],
        },
      },
    );
  }
  return resources;
}

function resourcePath(resource: KubernetesResource): string {
  const namespace = resource.metadata.namespace;
  const name = encodeURIComponent(resource.metadata.name);
  const prefix = namespace
    ? `/namespaces/${encodeURIComponent(namespace)}`
    : "";
  switch (resource.kind) {
    case "Namespace":
      return `/api/v1/namespaces/${name}`;
    case "ServiceAccount":
      return `/api/v1${prefix}/serviceaccounts/${name}`;
    case "LimitRange":
      return `/api/v1${prefix}/limitranges/${name}`;
    case "ResourceQuota":
      return `/api/v1${prefix}/resourcequotas/${name}`;
    case "NetworkPolicy":
      return `/apis/networking.k8s.io/v1${prefix}/networkpolicies/${name}`;
    default:
      throw new Error(`Unsupported Project Namespace resource: ${resource.kind}.`);
  }
}

class DisabledProjectNamespaceClient implements ProjectNamespaceClient {
  async reconcile(): Promise<void> {}
  async deleteAndWait(): Promise<void> {}
}

class UnavailableProjectNamespaceClient implements ProjectNamespaceClient {
  private unavailable(): never {
    throw new Error(
      "Project Runtime Namespaces are enabled, but the Kubernetes in-cluster API is unavailable.",
    );
  }
  async reconcile(): Promise<void> {
    this.unavailable();
  }
  async deleteAndWait(): Promise<void> {
    this.unavailable();
  }
}

export class KubernetesProjectNamespaceClient implements ProjectNamespaceClient {
  private readonly api: string;
  private token?: string;

  constructor(
    host = process.env.KUBERNETES_SERVICE_HOST,
    port = process.env.KUBERNETES_SERVICE_PORT_HTTPS ?? "443",
  ) {
    if (!host) throw new Error("Kubernetes API host is unavailable.");
    this.api = `https://${host}:${port}`;
  }

  async reconcile(input: ProjectNamespaceInput): Promise<void> {
    const resources = projectNamespaceResources(input);
    await this.assertNamespaceOwnership(input.namespace, input.projectId);
    await this.apply(resources[0]!);
    for (const resource of resources.slice(1)) {
      await this.apply(resource);
    }
  }

  async deleteAndWait(
    namespace: string,
    projectId: string,
    timeoutMs: number,
  ): Promise<void> {
    const path = `/api/v1/namespaces/${encodeURIComponent(namespace)}`;
    const existing = await this.assertNamespaceOwnership(namespace, projectId);
    if (!existing) return;
    await this.request(
      path,
      {
        method: "DELETE",
        body: JSON.stringify({
          apiVersion: "v1",
          kind: "DeleteOptions",
          ...(existing.metadata?.uid
            ? { preconditions: { uid: existing.metadata.uid } }
            : {}),
        }),
        headers: { "content-type": "application/json" },
      },
      true,
    );
    const deadline = Date.now() + timeoutMs;
    while (await this.assertNamespaceOwnership(namespace, projectId)) {
      if (Date.now() >= deadline) {
        throw new Error(
          `Project Runtime Namespace ${namespace} is still terminating after ${timeoutMs}ms.`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }

  private async assertNamespaceOwnership(
    namespace: string,
    projectId: string,
  ): Promise<KubernetesNamespace | undefined> {
    const existing = (await this.request(
      `/api/v1/namespaces/${encodeURIComponent(namespace)}`,
      { method: "GET" },
      true,
    )) as KubernetesNamespace | undefined;
    if (!existing) return undefined;
    const owner = existing.metadata?.annotations?.["tali.io/project-id"];
    if (owner !== projectId) {
      throw new Error(
        `Refusing to manage Kubernetes Namespace ${namespace}: expected Project ${projectId}, found ${owner ? `Project ${owner}` : "no tali.io/project-id owner"}.`,
      );
    }
    return existing;
  }

  private async apply(resource: KubernetesResource): Promise<void> {
    const query = new URLSearchParams({
      fieldManager: "tali-project-runtime-controller",
      force: "true",
    });
    await this.request(`${resourcePath(resource)}?${query}`, {
      method: "PATCH",
      body: JSON.stringify(resource),
      headers: { "content-type": "application/apply-patch+yaml" },
    });
  }

  private async request(
    path: string,
    init: RequestInit,
    allowNotFound = false,
  ): Promise<unknown> {
    this.token ??= (
      await readFile(
        "/var/run/secrets/kubernetes.io/serviceaccount/token",
        "utf8",
      )
    ).trim();
    const response = await fetch(`${this.api}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.token}`,
        accept: "application/json",
        ...init.headers,
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (allowNotFound && response.status === 404) return undefined;
    if (!response.ok) {
      const detail = (await response.text()).trim().slice(0, 2_000);
      throw new Error(
        `Project Runtime Namespace reconciliation failed: Kubernetes API returned ${response.status}${detail ? `: ${detail}` : "."}`,
      );
    }
    const body = await response.text();
    return body ? JSON.parse(body) : {};
  }
}

export function createProjectNamespaceClient(
  config: ControlConfig["runtime_namespaces"],
): ProjectNamespaceClient {
  if (!config.enabled) return new DisabledProjectNamespaceClient();
  if (!process.env.KUBERNETES_SERVICE_HOST) {
    return new UnavailableProjectNamespaceClient();
  }
  return new KubernetesProjectNamespaceClient();
}
