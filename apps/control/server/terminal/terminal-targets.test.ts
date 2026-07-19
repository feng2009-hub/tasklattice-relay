import { describe, expect, it } from "vitest";
import type { Agent } from "@tasklattice/contracts";
import { terminalTargetsForAgent } from "./terminal-targets";

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
} satisfies Agent;

describe("terminalTargetsForAgent", () => {
  it("returns the single primary Agent target without exposing Runtime identifiers", () => {
    expect(
      terminalTargetsForAgent(agent, {
        available: true,
        kind: "nemoclaw-tui",
        transport: "openshell",
      }),
    ).toEqual([
      {
        id: "agent",
        containerName: "agent",
        displayName: "OpenClaw Agent",
        primary: true,
        available: true,
        shells: [],
      },
    ]);
  });

  it("marks the target unavailable when the Agent is not ready", () => {
    const [target] = terminalTargetsForAgent(
      { ...agent, status: "FAILED" },
      { available: true, kind: "nemoclaw-tui", transport: "openshell" },
    );
    expect(target).toMatchObject({
      available: false,
      reason: "Terminal is available only when the agent is healthy and running.",
    });
  });
});
