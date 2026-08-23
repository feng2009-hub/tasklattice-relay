import { randomUUID } from "node:crypto";
import {
  agentConnectionSchema,
  agentGardenEntrySchema,
  createAgentConnectionSchema,
  onboardAgentSchema,
  onboardContainerImageAgentSchema,
  type AgentConnection,
  type AgentGardenEntry,
  type AgentGardenSnapshot,
  type CreateAgentConnectionInput,
  type OnboardAgentInput,
  type OnboardContainerImageAgentInput,
  type OnboardExistingAgentInput,
} from "@tali/contracts";
import {
  createManagedAgentRuntimeClient,
  type ManagedAgentRuntimeClient,
  type ManagedAgentRuntimeResult,
} from "../kubernetes/managed-agent-runtime-client";
import { ProjectStore } from "../projects/project-store";
import {
  createSecretStore,
  type SecretStore,
} from "../secrets/secret-store";
import {
  HttpAgentDiscoveryClient,
  type AgentDiscoveryClient,
} from "./agent-discovery";
import { AgentGardenStore } from "./agent-garden-store";
import { builtInAgentCatalog } from "./built-in-agent-catalog";
import { databaseAgentCatalog } from "./database-agent-catalog";

const integrationLabels: Record<
  OnboardExistingAgentInput["integrationType"],
  string
> = {
  a2a: "A2A Standard",
  langgraph: "LangGraph",
  langflow: "LangFlow",
  "bedrock-agentcore": "Bedrock AgentCore",
  "azure-ai-foundry": "Azure AI Foundry",
  "pydantic-ai": "Pydantic AI",
  "vertex-ai-agent-engine": "Vertex AI Agent Engine",
  "watsonx-orchestrate": "watsonx Orchestrate",
  custom: "Custom / Other",
};

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
  runtime?: ManagedAgentRuntimeResult,
  imageReference = input.image,
): Record<string, string> {
  return {
    onboardingSource: CONTAINER_IMAGE_SOURCE,
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
          serviceName: runtime.serviceName,
        }
      : {}),
  };
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
    const [, connections] = await Promise.all([
      this.store.ensureAgents(databaseAgentCatalog),
      this.store.listConnections(ownerUserId),
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
      connections,
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
      integrationType: input.integrationType,
      platformLabel: integrationLabels[input.integrationType],
      category: input.category,
      owner: input.owner,
      tags: input.tags,
      status: "UNCHECKED",
      usageMode: input.usageMode,
      usageCapabilities: usageCapabilities(input.usageMode),
      endpoint: input.endpoint,
      agentCardUrl: input.agentCardUrl ?? null,
      authType: input.authType,
      authReference: input.authReference,
      internalNetworkOnly: input.internalNetworkOnly,
      configuration: input.configuration,
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
      const { configuration } = input;
      return this.onboardExisting(
        {
          ...input,
          configuration: {
            ...configuration,
            onboardingSource: EXISTING_AGENT_SOURCE,
          },
        },
        ownerUserId,
      );
    }

    const now = new Date().toISOString();
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
      authType: "none",
      authReference: "",
      internalNetworkOnly: true,
      configuration: managedConfiguration(input),
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

  async discover(id: string): Promise<AgentGardenEntry> {
    const current = await this.requireProjectRegisteredAgent(id);
    let checking = await this.store.saveAgent({
      ...current,
      status: "UNCHECKED",
      updatedAt: new Date().toISOString(),
      lastDiscoveryError: null,
    });
    try {
      if (checking.configuration.onboardingSource === CONTAINER_IMAGE_SOURCE) {
        const input = containerInputFromAgent(checking);
        const target = await this.requireRuntimeTarget();
        const runtime = await this.runtime.onboard({
          ...input,
          agentId: checking.id,
          namespace: target.namespace,
          projectId: this.store.projectId,
        });
        checking = await this.store.saveAgent({
          ...checking,
          endpoint: runtime.endpoint,
          agentCardUrl: runtime.agentCardUrl,
          configuration: managedConfiguration(
            input,
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
      return this.store.saveAgent({
        ...checking,
        endpoint: result.endpoint,
        agentCardUrl: result.agentCardUrl,
        skills: result.skills,
        status: "READY",
        updatedAt: new Date().toISOString(),
        lastDiscoveredAt: new Date().toISOString(),
        lastDiscoveryError: null,
      });
    } catch (error) {
      return this.store.saveAgent({
        ...checking,
        status: "UNAVAILABLE",
        updatedAt: new Date().toISOString(),
        lastDiscoveryError: safeError(error),
      });
    }
  }

  async remove(id: string): Promise<boolean> {
    const agent = await this.requireProjectRegisteredAgent(id);
    if (await this.store.countConnectionsForAgent(id)) {
      throw new Error(
        "This Agent is connected to a Coordinator. Disconnect it before removal.",
      );
    }
    if (agent.configuration.onboardingSource === CONTAINER_IMAGE_SOURCE) {
      const target = await this.requireRuntimeTarget();
      await this.runtime.remove({
        agentId: agent.id,
        namespace: target.namespace,
        projectId: this.store.projectId,
      });
    }
    return this.store.deleteAgent(id);
  }

  async connect(
    rawInput: CreateAgentConnectionInput,
  ): Promise<AgentConnection> {
    const input = createAgentConnectionSchema.parse(rawInput);
    const [coordinator, connectedAgent] = await Promise.all([
      this.projects.get(input.coordinatorInstanceId),
      this.requireConnectableAgent(input.connectedAgentId),
    ]);
    if (!coordinator) throw new Error("Coordinator Instance was not found.");
    if (!["openclaw", "hermes"].includes(coordinator.agentPlatform)) {
      throw new Error(
        "This Instance runtime cannot delegate tasks to connected Agents.",
      );
    }
    if (!connectedAgent.usageCapabilities.acceptsDelegation) {
      throw new Error("This Agent does not accept delegated tasks.");
    }
    if (connectedAgent.status !== "READY") {
      throw new Error("Only a READY Agent can be connected to a Coordinator.");
    }
    const knownSkills = new Set(
      connectedAgent.skills.map((skill) => skill.id),
    );
    const unknownSkills = input.allowedSkillIds.filter(
      (skillId) => !knownSkills.has(skillId),
    );
    if (unknownSkills.length) {
      throw new Error(
        `Agent skills were not discovered: ${unknownSkills.join(", ")}.`,
      );
    }
    const existing = await this.store.findConnection(
      input.coordinatorInstanceId,
      input.connectedAgentId,
    );
    if (existing) throw new Error("This Agent is already connected.");
    const now = new Date().toISOString();
    return this.store.saveConnection(
      agentConnectionSchema.parse({
        id: randomUUID(),
        ...input,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }

  async disconnect(id: string): Promise<boolean> {
    return this.store.deleteConnection(id);
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

  private async requireConnectableAgent(
    id: string,
  ): Promise<AgentGardenEntry> {
    const builtIn = builtInAgentCatalog.find((agent) => agent.id === id);
    if (builtIn) {
      if (!builtIn.usageCapabilities.acceptsDelegation) {
        return builtIn;
      }
      return this.store.saveAgent(builtIn);
    }
    const agent = await this.store.getAgent(id);
    if (agent) return agent;
    const seeded = databaseAgentCatalog.find(
      (candidate) => candidate.id === id,
    );
    if (seeded) return this.store.saveAgent(seeded);
    throw new Error("Registered Agent was not found.");
  }
}
