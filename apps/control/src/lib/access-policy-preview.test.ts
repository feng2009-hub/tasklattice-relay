import { describe, expect, it } from "vitest";

import {
  accessPolicyPreviews,
  effectiveAccessDecisions,
  withAssignedMember,
  withServerDefaultDecision,
  withToolDecision,
} from "./access-policy-preview";

describe("access policy preview state", () => {
  it("updates one discovered tool without mutating the source policy", () => {
    const source = accessPolicyPreviews;
    const updated = withToolDecision(
      source,
      "data-operations",
      "github-create-issue",
      "deny",
    );

    expect(
      updated[0]?.servers[1]?.toolRules.find(
        (rule) => rule.id === "github-create-issue",
      )?.decision,
    ).toBe("deny");
    expect(
      source[0]?.servers[1]?.toolRules.find(
        (rule) => rule.id === "github-create-issue",
      )?.decision,
    ).toBe("inherit");
  });

  it("updates a server default without changing explicit rules", () => {
    const updated = withServerDefaultDecision(
      accessPolicyPreviews,
      "data-operations",
      "mcp-github-tools",
      "deny",
    );

    expect(updated[0]?.servers[1]?.defaultDecision).toBe("deny");
    expect(updated[0]?.servers[1]?.toolRules[0]?.decision).toBe("allow");
  });

  it("assigns a member once and ignores blank assignments", () => {
    const assigned = withAssignedMember(
      accessPolicyPreviews,
      "data-operations",
      "Incident Investigator",
    );
    const duplicate = withAssignedMember(
      assigned,
      "data-operations",
      "Incident Investigator",
    );

    expect(
      duplicate[0]?.assignedMembers.filter(
        (member) => member === "Incident Investigator",
      ),
    ).toHaveLength(1);
    expect(withAssignedMember(duplicate, "data-operations", " ")).toBe(
      duplicate,
    );
  });

  it("uses the most restrictive decision across bound policies", () => {
    const secondPolicy = {
      ...accessPolicyPreviews[0]!,
      id: "second-policy",
      name: "Second Policy",
      servers: accessPolicyPreviews[0]!.servers.map((server) => ({
        ...server,
        toolRules: server.toolRules.map((rule) =>
          rule.id === "github-search" ? { ...rule, decision: "deny" as const } : rule,
        ),
      })),
    };
    const decisions = effectiveAccessDecisions([
      accessPolicyPreviews[0]!,
      secondPolicy,
    ]);

    expect(
      decisions.find((item) =>
        item.capability.includes("search_repositories"),
      ),
    ).toMatchObject({
      decision: "deny",
      enforcedBy: "Tool Gateway",
    });
  });
});
