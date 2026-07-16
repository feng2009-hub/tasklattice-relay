import { describe, expect, it } from "vitest";
import { createAgentSchema, sandboxPolicies } from "@tasklattice/contracts";
import { agentSandboxName } from "./agent-service";

describe("Agent sandbox naming", () => {
  it("stays within the OpenShell service-routing limit", () => {
    const name = agentSandboxName(
      "A Very Long Research Assistant Name",
      "12345678-1234-4000-8000-123456789abc",
    );

    expect(name).toBe("tali-a-very-long-re-12345678");
    expect(name.length).toBeLessThanOrEqual(28);
    expect(name).toMatch(/^[a-z][a-z0-9-]+[a-z0-9]$/);
  });

  it("keeps the id suffix when the display name has no slug characters", () => {
    expect(
      agentSandboxName("研究助手", "abcdef01-1234-4000-8000-123456789abc"),
    ).toBe("tali-agent-abcdef01");
  });
});

describe("OpenShell policy assignment", () => {
  it("offers a full-access GitHub example that can be assigned to an Agent", () => {
    const policy = sandboxPolicies.find(
      (item) => item.id === "github-full-access",
    );

    expect(policy?.policyYaml).toContain("host: api.github.com");
    expect(policy?.policyYaml).toContain("access: full");
    expect(
      createAgentSchema.parse({
        name: "GitHub Operator",
        description: "",
        runtime: "nemoclaw",
        providerConnectionId: "provider-a",
        provider: "deepseek",
        model: "deepseek-chat",
        policyId: "github-full-access",
        systemPrompt: "Operate on GitHub and report the resulting evidence.",
      }).policyId,
    ).toBe("github-full-access");
  });
});

describe("Agent platform selection", () => {
  const input = {
    name: "Research Assistant",
    description: "",
    runtime: "nemoclaw" as const,
    providerConnectionId: "provider-a",
    provider: "deepseek" as const,
    model: "deepseek-chat" as const,
    policyId: "restricted" as const,
    systemPrompt: "Research the request and report the resulting evidence.",
  };

  it("keeps OpenClaw as the backward-compatible default", () => {
    expect(createAgentSchema.parse(input).agentPlatform).toBe("openclaw");
  });

  it("accepts Hermes as an explicit NemoClaw Agent platform", () => {
    expect(
      createAgentSchema.parse({ ...input, agentPlatform: "hermes" })
        .agentPlatform,
    ).toBe("hermes");
  });
});
