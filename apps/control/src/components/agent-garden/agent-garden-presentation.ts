import {
  agentPlatforms,
  type AgentPlatformId,
  type AgentGardenEntry,
  type AgentGardenIntegrationType,
} from "@tali/contracts";

export interface AgentTypePresentation {
  description: string;
  label: string;
  shortLabel: string;
}

export const agentTypePresentations: Record<
  AgentGardenIntegrationType,
  AgentTypePresentation
> = {
  ...Object.fromEntries(agentPlatforms.map((platform) => [platform.id, {
    label: platform.name,
    shortLabel: platform.name,
    description: platform.description,
  }])) as Record<AgentPlatformId, AgentTypePresentation>,
  "claude-code": {
    label: "Claude Code",
    shortLabel: "Claude Code",
    description: "Repository-native interactive coding Agent.",
  },
  a2a: {
    label: "A2A Standard",
    shortLabel: "A2A",
    description: "Discover and validate an Agent through an A2A 1.0 Agent Card.",
  },
};

export function usageModeLabel(
  mode: "INTERACTIVE" | "CALLABLE" | "HYBRID",
): string {
  if (mode === "INTERACTIVE") return "Interactive";
  if (mode === "CALLABLE") return "Callable";
  return "Interactive + callable";
}

export function agentStatusLabel(
  status: "READY" | "COMING_SOON" | "UNCHECKED" | "UNAVAILABLE",
): string {
  if (status === "COMING_SOON") return "Coming soon";
  if (status === "UNCHECKED") return "Checking";
  if (status === "UNAVAILABLE") return "Needs attention";
  return "Ready";
}

export function isPreviewAgent(agent: AgentGardenEntry): boolean {
  return agent.configuration.previewMode === "DETERMINISTIC";
}

export function previewAgentLabel(agent: AgentGardenEntry): string {
  return agent.configuration.catalogKind === "EXAMPLE_BLUEPRINT"
    ? "Blueprint"
    : "Demo";
}
