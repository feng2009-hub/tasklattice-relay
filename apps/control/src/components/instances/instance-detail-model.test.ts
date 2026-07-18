import { describe, expect, it } from "vitest";
import type { Agent } from "@tasklattice/contracts";
import { endpointStatus, formatUptime, getCapabilityCounts, getInstanceAccessState, getInstanceDisplayStatus, normalizeInstanceDetailTab } from "./instance-detail-model";

const agent = {
  id: "2b0dc5a0-0d15-4b90-bc3f-71112b812efd",
  name: "research-agent",
  description: "",
  runtime: "openshell",
  agentPlatform: "openclaw",
  modelDeploymentId: "deployment",
  systemPrompt: "You are a research Agent.",
  policyId: "default",
  providerAccountId: "provider",
  providerName: "DeepSeek",
  model: "deepseek-chat",
  modelType: "llm",
  costKeyAlias: "alias",
  sandboxName: "tali-research-agent",
  status: "READY",
  createdAt: "2026-07-18T08:00:00.000Z",
  updatedAt: "2026-07-18T08:05:00.000Z",
  logs: [],
  skillIds: ["one", "two"],
  mcpServerIds: ["mcp"],
  knowledgeSourceIds: [],
  httpEndpoint: { kind: "openclaw-webui", status: "READY", url: "https://agent.example" },
} satisfies Agent;

describe("instance detail model", () => {
  it("normalizes invalid tabs to overview", () => {
    expect(normalizeInstanceDetailTab("capabilities")).toBe("capabilities");
    expect(normalizeInstanceDetailTab("unknown")).toBe("overview");
  });

  it("maps backend lifecycle states", () => {
    expect(getInstanceDisplayStatus("PROVISIONING")).toBe("creating");
    expect(getInstanceDisplayStatus("READY")).toBe("ready");
    expect(getInstanceDisplayStatus("FAILED")).toBe("failed");
  });

  it("enables access only when the endpoint and runtime are ready", () => {
    const access = getInstanceAccessState(agent, { mode: "openshell", terminal: { available: true, kind: "nemoclaw-tui", transport: "openshell" } });
    expect(access.webUI).toMatchObject({ enabled: true, url: "https://agent.example" });
    expect(access.console.enabled).toBe(true);
    expect(getInstanceAccessState({ ...agent, status: "PROVISIONING" }, undefined).webUI.enabled).toBe(false);
  });

  it("formats uptime and capability counts from real fields", () => {
    expect(formatUptime(agent, Date.parse("2026-07-18T10:05:00.000Z"))).toBe("2h 5m");
    expect(getCapabilityCounts(agent)).toEqual({ skills: 2, mcpServers: 1, knowledgeBases: 0 });
    expect(endpointStatus(agent)).toBe("available");
  });
});
