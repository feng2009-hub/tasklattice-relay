import {
  agentPlatforms,
  defaultAgentPlatformId,
  type AgentPlatformId,
} from "@tasklattice/contracts";

const platformBrandAssets: Partial<Record<AgentPlatformId, string>> = {
  hermes: "/assets/brands/hermes-agent-logo.png",
};

export const agentPlatformPresentations = agentPlatforms.map((platform) => ({
  ...platform,
  brandAsset: platformBrandAssets[platform.id],
  runtimeName: "NemoClaw",
}));

export type AgentPlatformPresentation =
  (typeof agentPlatformPresentations)[number];

export function getAgentPlatformPresentation(
  id: AgentPlatformId = defaultAgentPlatformId,
): AgentPlatformPresentation {
  return (
    agentPlatformPresentations.find((platform) => platform.id === id) ??
    agentPlatformPresentations[0]!
  );
}
