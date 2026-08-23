import { onboardAgentSchema } from "@tali/contracts";
import { describe, expect, it } from "vitest";

const identity = {
  name: "Repository Agent",
  description: "Builds and runs an Agent from a source repository.",
  category: "Developer Tools",
  owner: "Developer Experience",
  tags: [],
};

describe("Agent onboarding contract", () => {
  it("reports an incomplete Repository URL without throwing", () => {
    expect(() => onboardAgentSchema.safeParse({
      ...identity,
      sourceType: "git-repository",
      repositoryUrl: "",
      revision: "main",
      contextDir: ".",
      dockerfile: "Dockerfile",
      containerPort: 8_080,
      agentCardPath: "/.well-known/agent-card.json",
      usageMode: "CALLABLE",
    })).not.toThrow();
    expect(onboardAgentSchema.safeParse({
      ...identity,
      sourceType: "git-repository",
      repositoryUrl: "",
      revision: "main",
      contextDir: ".",
      dockerfile: "Dockerfile",
      containerPort: 8_080,
      agentCardPath: "/.well-known/agent-card.json",
      usageMode: "CALLABLE",
    }).success).toBe(false);
  });

  it("applies the managed image runtime defaults", () => {
    expect(onboardAgentSchema.parse({
      ...identity,
      sourceType: "container-image",
      image: "ghcr.io/acme/research-agent:v1.4.0",
    })).toMatchObject({
      containerPort: 8_080,
      agentCardPath: "/.well-known/agent-card.json",
      imagePullSecretName: "",
      command: [],
      args: [],
      usageMode: "CALLABLE",
    });
  });

  it("accepts only a published A2A Agent Card for an existing Agent", () => {
    expect(onboardAgentSchema.parse({
      ...identity,
      sourceType: "existing-agent",
      agentCardUrl: "https://agents.example.com/.well-known/agent-card.json",
    })).toMatchObject({
      sourceType: "existing-agent",
      authType: "none",
      internalNetworkOnly: false,
    });

    expect(onboardAgentSchema.safeParse({
      ...identity,
      sourceType: "existing-agent",
      agentCardUrl: "https://agents.example.com/.well-known/agent-card.json",
      integrationType: "langgraph",
      endpoint: "https://agents.example.com",
      usageMode: "INTERACTIVE",
    }).success).toBe(false);
  });

  it("reports an incomplete Agent Card URL without throwing", () => {
    const input = {
      ...identity,
      sourceType: "existing-agent",
      agentCardUrl: "",
    };

    expect(() => onboardAgentSchema.safeParse(input)).not.toThrow();
    expect(onboardAgentSchema.safeParse(input).success).toBe(false);
  });
});
