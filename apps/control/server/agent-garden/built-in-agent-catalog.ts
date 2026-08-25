import {
  agentPlatforms,
  agentGardenEntrySchema,
  type AgentGardenEntry,
} from "@tali/contracts";

const common = {
  source: "BUILT_IN" as const,
  endpoint: null,
  agentCardUrl: null,
  a2a: null,
  authType: "none" as const,
  authReference: "",
  internalNetworkOnly: false,
  configuration: {},
  skills: [],
  createdAt: null,
  updatedAt: null,
  lastDiscoveredAt: null,
  lastDiscoveryError: null,
};

export const builtInAgentCatalog: AgentGardenEntry[] = [
  ...agentPlatforms.map((platform) => ({
    ...common,
    id: platform.catalog.id,
    name: platform.catalog.name,
    description: platform.catalog.description,
    integrationType: platform.id,
    platformLabel: platform.name,
    category: platform.catalog.category,
    owner: "TaskLattice Relay",
    tags: [...platform.catalog.tags],
    status: "READY" as const,
    usageMode: "INTERACTIVE" as const,
    usageCapabilities: {
      interactive: platform.capabilities.interactive,
      canDelegate: platform.capabilities.canDelegate,
      acceptsDelegation: platform.capabilities.acceptsDelegation,
    },
    specializationId: platform.catalog.specializationId,
  })),
  {
    ...common,
    id: "claude-code",
    name: "Claude Code",
    description:
      "A repository-native interactive coding Agent. Runtime integration is on the TaskLattice Relay roadmap.",
    integrationType: "claude-code",
    platformLabel: "Claude Code",
    category: "Developer Tools",
    owner: "TaskLattice Relay",
    tags: ["Coding", "Repository"],
    status: "COMING_SOON",
    usageMode: "INTERACTIVE",
    usageCapabilities: {
      interactive: true,
      canDelegate: false,
      acceptsDelegation: false,
    },
    specializationId: null,
  },
].map((entry) => agentGardenEntrySchema.parse(entry));
