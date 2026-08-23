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
});
