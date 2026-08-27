import { randomUUID } from "node:crypto";
import {
  agentGardenEntrySchema,
  a2aAgentInstanceSchema,
  onboardAgentSchema,
  onboardContainerImageAgentSchema,
  type A2aAgentInstance,
  type AgentGardenEntry,
  type AgentGardenSnapshot,
  type OnboardAgentInput,
  type OnboardContainerImageAgentInput,
  type OnboardExistingAgentInput,
} from "@tali/contracts";
import {
  createManagedAgentRuntimeClient,
  managedAgentResourceName,
  type ManagedAgentRuntimeClient,
  type ManagedAgentRuntimeResult,
} from "../kubernetes/managed-agent-runtime-client";
import { ProjectStore } from "../projects/project-store";
import { createSecretStore, type SecretStore } from "../secrets/secret-store";
import {
  HttpAgentDiscoveryClient,
  type AgentDiscoveryClient,
} from "./agent-discovery";
import { AgentGardenStore } from "./agent-garden-store";
import { builtInAgentCatalog } from "./built-in-agent-catalog";
import { databaseAgentCatalog } from "./database-agent-catalog";

function resourceId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
    .replace(/-$/, "") || "agent";
  return `${slug}-${randomUUID().slice(0, 8)}`;
}

function safeError(error: unknown): string {
  return (
    error instanceof Error ? error.message : String(error)
  ).slice(0, 4_000);
}

function usageCapabilities(
  mode: AgentGardenEntry["usageMode"],
): AgentGardenEntry["usageCapabilities"] {
  return {
    interactive: mode !== "CALLABLE",
    canDelegate: false,
    acceptsDelegation: mode !== "INTERACTIVE",
  };
}

const CONTAINER_IMAGE_SOURCE = "CONTAINER_IMAGE";
const EXISTING_AGENT_SOURCE = "EXISTING_AGENT";

function configurationList(value: string | undefined): string[] {
  if (!value) return [];
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
    throw new Error("Stored Agent container command configuration is invalid.");
  }
  return parsed;
}

function containerInputFromAgent(
  agent: AgentGardenEntry,
): OnboardContainerImageAgentInput {
  return onboardContainerImageAgentSchema.parse({
    sourceType: "container-image",
    name: agent.name,
    description: agent.description,
    category: agent.category,
    owner: agent.owner,
    tags: agent.tags,
    usageMode: "CALLABLE",
    image:
      agent.configuration.imageDigest
      ?? agent.configuration.imageReference,
    containerPort: Number(agent.configuration.containerPort),
    agentCardPath: agent.configuration.agentCardPath,
    imagePullSecretName: agent.configuration.imagePullSecretName ?? "",
    command: configurationList(agent.configuration.command),
    args: configurationList(agent.configuration.args),
  });
}

function managedConfiguration(
  input: OnboardContainerImageAgentInput,
  instanceId: string,
  runtime?: ManagedAgentRuntimeResult,
  imageReference = input.image,
): Record<string, string> {
  return {
    onboardingSource: CONTAINER_IMAGE_SOURCE,
    managedInstanceId: instanceId,
    imageReference,
    containerPort: String(input.containerPort),
    agentCardPath: input.agentCardPath,
    imagePullSecretName: input.imagePullSecretName,
    command: JSON.stringify(input.command),
    args: JSON.stringify(input.args),
    ...(runtime
      ? {
          imageDigest: runtime.imageDigest,
          runtimeNamespace: runtime.namespace,
          deploymentName: runtime.deploymentName,
          podName: runtime.podName,
          serviceName: runtime.serviceName,
        }
      : {}),
  };
}

function appendLifecycleLog(
  logs: readonly string[] | undefined,
  message: string,
): string[] {
  return logs?.at(-1) === message ? [...logs] : [...(logs ?? []), message];
}

function managedInstance(
  agent: AgentGardenEntry,
  input: OnboardContainerImageAgentInput,
  instanceId: string,
  namespace: string,
  previous?: A2aAgentInstance,
  runtime?: ManagedAgentRuntimeResult,
  discovery?: {
    a2a: AgentGardenEntry["a2a"];
    endpoint: string;
    agentCardUrl: string;
    skills: AgentGardenEntry["skills"];
  },
  failure?: string,
): A2aAgentInstance {
  const now = new Date().toISOString();
  const resourceName = managedAgentResourceName(instanceId);
  const status = failure ? "FAILED" : discovery ? "READY" : "PROVISIONING";
  const lifecycleMessage = failure
    ? `Managed A2A Instance failed: ${failure}`
    : discovery
      ? `A2A Agent Card validated. Pod ${runtime?.podName ?? previous?.podName ?? resourceName} is ready.`
      : `Provisioning ${resourceName} in Project Main Space ${namespace}.`;
  return a2aAgentInstanceSchema.parse({
    id: instanceId,
    agentId: agent.id,
    kind: "A2A",
    name: agent.name,
    description: agent.description,
    runtime: "kubernetes",
    status,
    provisioningStage: discovery ? "READY" : runtime ? "ENDPOINT" : "POD",
    runtimeNamespace: namespace,
    deploymentName: runtime?.deploymentName ?? previous?.deploymentName ?? resourceName,
    serviceName: runtime?.serviceName ?? previous?.serviceName ?? resourceName,
    podName: runtime?.podName ?? previous?.podName ?? null,
    labelSelector: `app.kubernetes.io/instance=${resourceName}`,
    imageReference:
      agent.configuration.imageReference ?? previous?.imageReference ?? input.image,
    imageDigest: runtime?.imageDigest ?? previous?.imageDigest ?? null,
    endpoint: discovery?.endpoint ?? runtime?.endpoint ?? previous?.endpoint ?? null,
    agentCardUrl:
      discovery?.agentCardUrl
      ?? runtime?.agentCardUrl
      ?? previous?.agentCardUrl
      ?? null,
    a2a: discovery?.a2a ?? previous?.a2a ?? null,
    skills: discovery?.skills ?? previous?.skills ?? [],
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    logs: appendLifecycleLog(previous?.logs, lifecycleMessage),
    error: failure ?? null,
  });
}

function externalInstance(
  agent: AgentGardenEntry,
  instanceId: string,
  previous?: A2aAgentInstance,
  failure?: string,
): A2aAgentInstance {
  const now = new Date().toISOString();
  const ready = !failure
    && agent.status === "READY"
    && Boolean(agent.endpoint)
    && Boolean(agent.agentCardUrl)
    && Boolean(agent.a2a);
  return a2aAgentInstanceSchema.parse({
    id: instanceId,
    agentId: agent.id,
    kind: "A2A",
    name: agent.name,
    description: agent.description,
    runtime: "external",
    status: failure || !ready ? "FAILED" : "READY",
    provisioningStage: ready ? "READY" : "ENDPOINT",
    runtimeNamespace: null,
    deploymentName: null,
    serviceName: null,
    podName: null,
    labelSelector: null,
    imageReference: null,
    imageDigest: null,
    endpoint: agent.endpoint ?? previous?.endpoint ?? null,
    agentCardUrl: agent.agentCardUrl ?? previous?.agentCardUrl ?? null,
    a2a: agent.a2a ?? previous?.a2a ?? null,
    skills: agent.skills.length ? agent.skills : previous?.skills ?? [],
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    logs: appendLifecycleLog(
      previous?.logs,
      failure
        ? `External A2A Instance discovery failed: ${failure}`
        : "A2A Agent Card validated. The external runtime is available through the Project Runtime Bridge.",
    ),
    error: failure ?? null,
  });
}

export class AgentGardenService {
  constructor(
    readonly store = new AgentGardenStore(),
    readonly projects = new ProjectStore(
      store.projectId,
      store.database(),
    ),
    readonly discovery: AgentDiscoveryClient = new HttpAgentDiscoveryClient(),
    readonly secrets: SecretStore = createSecretStore(),
    readonly runtime: ManagedAgentRuntimeClient = createManagedAgentRuntimeClient(),
  ) {}

  async snapshot(ownerUserId?: string): Promise<AgentGardenSnapshot> {
    const [, instances] = await Promise.all([
      this.store.ensureAgents(databaseAgentCatalog),
      this.store.listManagedInstances(ownerUserId),
    ]);
    const persistedAgents = await this.store.listAgents(ownerUserId);
    const builtInIds = new Set(
      builtInAgentCatalog.map((agent) => agent.id),
    );
    const databaseIds = new Set(
      databaseAgentCatalog.map((agent) => agent.id),
    );
    const persistedById = new Map(
      persistedAgents.map((agent) => [agent.id, agent]),
    );
    return {
      agents: [
        ...builtInAgentCatalog,
        ...databaseAgentCatalog.map(
          (agent) => persistedById.get(agent.id) ?? agent,
        ),
        ...persistedAgents.filter(
          (agent) =>
            !builtInIds.has(agent.id) &&
            !databaseIds.has(agent.id),
        ),
      ],
      instances,
    };
  }

  private async onboardExisting(
    input: OnboardExistingAgentInput,
    ownerUserId?: string,
  ): Promise<AgentGardenEntry> {
    const now = new Date().toISOString();
    const agent = agentGardenEntrySchema.parse({
      id: resourceId(input.name),
      name: input.name,
      description: input.description,
      source: "PROJECT_REGISTERED",
      integrationType: "a2a",
      platformLabel: "A2A Standard",
      category: input.category,
      owner: input.owner,
      tags: input.tags,
      status: "UNCHECKED",
      usageMode: "CALLABLE",
      usageCapabilities: usageCapabilities("CALLABLE"),
      endpoint: null,
      agentCardUrl: input.agentCardUrl,
      a2a: null,
      authType: input.authType,
      authReference: input.authReference,
      internalNetworkOnly: input.internalNetworkOnly,
      configuration: { onboardingSource: EXISTING_AGENT_SOURCE },
      skills: [],
      specializationId: null,
      createdAt: now,
      updatedAt: now,
      lastDiscoveredAt: null,
      lastDiscoveryError: null,
    });
    await this.store.saveAgent(agent, ownerUserId);
    return this.discover(agent.id, ownerUserId);
  }

  async instantiate(
    id: string,
    ownerUserId?: string,
  ): Promise<A2aAgentInstance> {
    if (!ownerUserId) {
      throw new Error("An owner user is required when creating an A2A Instance.");
    }
    const agent = await this.requireCallableAgent(id);
    if (agent.status !== "READY") {
      throw new Error("Only a READY Agent can be instantiated.");
    }
    if (!agent.usageCapabilities.acceptsDelegation) {
      throw new Error("This Agent does not accept delegated tasks.");
    }
    if (!agent.endpoint || !agent.agentCardUrl || !agent.a2a) {
      throw new Error("A validated A2A Agent Card is required before creating an Instance.");
    }
    const existing = await this.store.getManagedInstanceForAgent(agent.id);
    if (existing) return existing;
    return this.store.saveManagedInstance(
      externalInstance(agent, randomUUID()),
      ownerUserId,
    );
  }

  async onboard(
    rawInput: OnboardAgentInput,
    ownerUserId?: string,
  ): Promise<AgentGardenEntry> {
    const input = onboardAgentSchema.parse(rawInput);
    if (input.sourceType === "git-repository") {
      throw new Error(
        "Git Repository onboarding is not enabled yet. Build and publish the repository as an OCI image, then use Container Image onboarding.",
      );
    }
    if (input.sourceType === "existing-agent") {
      return this.onboardExisting(input, ownerUserId);
    }

    const now = new Date().toISOString();
    const instanceId = randomUUID();
    const agent = agentGardenEntrySchema.parse({
      id: resourceId(input.name),
      name: input.name,
      description: input.description,
      source: "PROJECT_REGISTERED",
      integrationType: "a2a",
      platformLabel: "A2A Container",
      category: input.category,
      owner: input.owner,
      tags: input.tags,
      status: "UNCHECKED",
      usageMode: "CALLABLE",
      usageCapabilities: usageCapabilities("CALLABLE"),
      endpoint: null,
      agentCardUrl: null,
      a2a: null,
      authType: "none",
      authReference: "",
      internalNetworkOnly: true,
      configuration: managedConfiguration(input, instanceId),
      skills: [],
      specializationId: null,
      createdAt: now,
      updatedAt: now,
      lastDiscoveredAt: null,
      lastDiscoveryError: null,
    });
    await this.store.saveAgent(agent, ownerUserId);
    return this.discover(agent.id);
  }

  async discover(
    id: string,
    ownerUserId?: string,
  ): Promise<AgentGardenEntry> {
    const current = await this.requireProjectRegisteredAgent(id);
    let checking = await this.store.saveAgent({
      ...current,
      status: "UNCHECKED",
      updatedAt: new Date().toISOString(),
      lastDiscoveryError: null,
    });
    let runtimeInstance: A2aAgentInstance | undefined;
    let runtimeResult: ManagedAgentRuntimeResult | undefined;
    try {
      if (checking.configuration.onboardingSource === CONTAINER_IMAGE_SOURCE) {
        const input = containerInputFromAgent(checking);
        const target = await this.requireRuntimeTarget();
        const instanceId = checking.configuration.managedInstanceId || randomUUID();
        if (!checking.configuration.managedInstanceId) {
          checking = await this.store.saveAgent({
            ...checking,
            configuration: managedConfiguration(
              input,
              instanceId,
              undefined,
              checking.configuration.imageReference ?? input.image,
            ),
            updatedAt: new Date().toISOString(),
          });
        }
        const ownerUserId = await this.store.ownerUserId(checking.id);
        if (!ownerUserId) {
          throw new Error("Managed A2A Instance ownership could not be resolved.");
        }
        const previous = await this.store.getManagedInstanceForAgent(checking.id);
        runtimeInstance = managedInstance(
          checking,
          input,
          instanceId,
          target.namespace,
          previous,
        );
        await this.store.saveManagedInstance(runtimeInstance, ownerUserId);
        const runtime = await this.runtime.onboard({
          ...input,
          agentId: checking.id,
          instanceId,
          namespace: target.namespace,
          projectId: this.store.projectId,
        });
        runtimeResult = runtime;
        runtimeInstance = managedInstance(
          checking,
          input,
          instanceId,
          target.namespace,
          runtimeInstance,
          runtime,
        );
        await this.store.saveManagedInstance(runtimeInstance);
        checking = await this.store.saveAgent({
          ...checking,
          endpoint: runtime.endpoint,
          agentCardUrl: runtime.agentCardUrl,
          configuration: managedConfiguration(
            input,
            instanceId,
            runtime,
            checking.configuration.imageReference ?? input.image,
          ),
          updatedAt: new Date().toISOString(),
        });
      }
      const credential = checking.authReference
        ? await this.secrets.get(checking.authReference)
        : undefined;
      const result = await this.discovery.discover(checking, credential);
      const ready = await this.store.saveAgent({
        ...checking,
        endpoint: result.endpoint,
        agentCardUrl: result.agentCardUrl,
        a2a: result.a2a,
        skills: result.skills,
        status: "READY",
        updatedAt: new Date().toISOString(),
        lastDiscoveredAt: new Date().toISOString(),
        lastDiscoveryError: null,
      });
      if (runtimeInstance) {
        const input = containerInputFromAgent(ready);
        const target = await this.requireRuntimeTarget();
        const instanceId = ready.configuration.managedInstanceId;
        if (!instanceId) {
          throw new Error("Managed A2A Instance identifier was not persisted.");
        }
        await this.store.saveManagedInstance(managedInstance(
          ready,
          input,
          instanceId,
          target.namespace,
          runtimeInstance,
          runtimeResult,
          result,
        ));
      } else if (checking.configuration.onboardingSource === EXISTING_AGENT_SOURCE) {
        const previous = await this.store.getManagedInstanceForAgent(ready.id);
        if (previous || ownerUserId) {
          await this.store.saveManagedInstance(
            externalInstance(ready, previous?.id ?? randomUUID(), previous),
            previous ? undefined : ownerUserId,
          );
        }
      }
      return ready;
    } catch (error) {
      const message = safeError(error);
      if (runtimeInstance) {
        const input = containerInputFromAgent(checking);
        if (!runtimeInstance.runtimeNamespace) {
          throw new Error("Managed A2A Instance Runtime Namespace is missing.");
        }
        await this.store.saveManagedInstance(managedInstance(
          checking,
          input,
          runtimeInstance.id,
          runtimeInstance.runtimeNamespace,
          runtimeInstance,
          undefined,
          undefined,
          message,
        ));
      } else if (checking.configuration.onboardingSource === EXISTING_AGENT_SOURCE) {
        const previous = await this.store.getManagedInstanceForAgent(checking.id);
        if (previous) {
          await this.store.saveManagedInstance(
            externalInstance(checking, previous.id, previous, message),
          );
        }
      }
      return this.store.saveAgent({
        ...checking,
        status: "UNAVAILABLE",
        updatedAt: new Date().toISOString(),
        lastDiscoveryError: message,
      });
    }
  }

  async remove(id: string): Promise<boolean> {
    const agent = await this.requireProjectRegisteredAgent(id);
    if (agent.configuration.onboardingSource === CONTAINER_IMAGE_SOURCE) {
      const target = await this.requireRuntimeTarget();
      const instance = await this.store.getManagedInstanceForAgent(agent.id);
      const instanceId = instance?.id ?? agent.configuration.managedInstanceId;
      if (!instanceId) {
        throw new Error(
          "Managed A2A Instance metadata is missing. Reconcile the Agent before removal.",
        );
      }
      await this.runtime.remove({
        agentId: agent.id,
        instanceId,
        namespace: target.namespace,
        projectId: this.store.projectId,
      });
      await this.store.deleteManagedInstanceForAgent(agent.id);
    } else {
      await this.store.deleteManagedInstanceForAgent(agent.id);
    }
    return this.store.deleteAgent(id);
  }

  async removeInstance(id: string): Promise<boolean> {
    const instance = await this.store.getManagedInstance(id);
    if (!instance) return false;
    if (instance.runtime !== "external") {
      throw new Error(
        "Remove the managed Agent definition to delete its Kubernetes runtime.",
      );
    }
    return this.store.deleteManagedInstance(id);
  }

  private async requireProjectRegisteredAgent(
    id: string,
  ): Promise<AgentGardenEntry> {
    const agent = await this.store.getAgent(id);
    if (!agent) throw new Error("Registered Agent was not found.");
    if (agent.source !== "PROJECT_REGISTERED") {
      throw new Error("Built-in Agents are managed by TaskLattice Relay.");
    }
    return agent;
  }

  private async requireRuntimeTarget(): Promise<{ namespace: string }> {
    const target = await this.store.database().projectRuntimeTarget.findUnique({
      where: { projectId: this.store.projectId },
      select: { namespace: true, status: true },
    });
    if (!target) {
      throw new Error(
        "This Project does not have a Runtime Namespace. Reconcile Project runtime targets before onboarding a Container Image.",
      );
    }
    if (target.status !== "ready") {
      throw new Error(
        `Project Runtime Namespace is ${target.status}. Reconcile it before onboarding a Container Image.`,
      );
    }
    return target;
  }

  private async requireCallableAgent(id: string): Promise<AgentGardenEntry> {
    const existing = await this.store.getAgent(id);
    if (existing) return existing;
    const seeded = databaseAgentCatalog.find((candidate) => candidate.id === id);
    if (!seeded) throw new Error("Agent Garden entry was not found.");
    return this.store.saveAgent(seeded);
  }
}
