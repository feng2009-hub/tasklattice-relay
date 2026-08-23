import { agentGardenEntrySchema } from "@tali/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpAgentDiscoveryClient } from "./agent-discovery";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HttpAgentDiscoveryClient", () => {
  it("keeps a managed container on its internal Service endpoint", async () => {
    const endpoint = "http://tali-a2a-test.tali-p-test.svc.cluster.local:8080";
    const agent = agentGardenEntrySchema.parse({
      id: "managed-agent",
      name: "Managed Agent",
      description: "A managed container used for delegated research tasks.",
      source: "PROJECT_REGISTERED",
      integrationType: "a2a",
      platformLabel: "A2A Container",
      category: "Research",
      owner: "Research Platform",
      tags: [],
      status: "UNCHECKED",
      usageMode: "CALLABLE",
      usageCapabilities: {
        interactive: false,
        canDelegate: false,
        acceptsDelegation: true,
      },
      endpoint,
      agentCardUrl: `${endpoint}/.well-known/agent-card.json`,
      authType: "none",
      authReference: "",
      internalNetworkOnly: true,
      configuration: { onboardingSource: "CONTAINER_IMAGE" },
      skills: [],
      specializationId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastDiscoveredAt: null,
      lastDiscoveryError: null,
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      name: "Managed Agent",
      supportedInterfaces: [{
        url: "https://advertised.example.com/a2a",
        protocolBinding: "JSONRPC",
        protocolVersion: "0.3.0",
      }],
      skills: [{ id: "research", name: "Research" }],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })));

    const result = await new HttpAgentDiscoveryClient().discover(agent);

    expect(result.endpoint).toBe(endpoint);
    expect(result.skills).toEqual([{
      id: "research",
      name: "Research",
      description: "",
      tags: [],
    }]);
  });
});
