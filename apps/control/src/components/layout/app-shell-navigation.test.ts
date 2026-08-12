import { describe, expect, it } from "vitest";
import { homeItem, itemIsActive, navGroups } from "./app-shell";

describe("Project control-plane navigation", () => {
  it("expresses the layered information architecture without exposing implementation routes", () => {
    expect(navGroups.map((group) => group.label)).toEqual([
      "Capability toolbox",
      "Governance",
      "Evidence",
    ]);
    expect(navGroups.map((group) => group.items.map((item) => item.label))).toEqual([
      ["Specialist Agents", "Skills", "MCP Connections", "Knowledge Sources"],
      ["Access Policies", "Runtime Policies", "Project Settings"],
      ["Traces", "Audit Logs", "Cost"],
    ]);
    expect(navGroups.flatMap((group) => group.items.map((item) => item.label))).not.toContain(
      "Instances",
    );
    expect(navGroups.flatMap((group) => group.items.map((item) => item.label))).not.toContain(
      "Memory",
    );
  });

  it("treats Runtime Instances and Memory as Home detail surfaces", () => {
    expect(itemIsActive(homeItem, "/p-hr", "p-hr")).toBe(true);
    expect(itemIsActive(homeItem, "/p-hr/", "p-hr")).toBe(true);
    expect(itemIsActive(homeItem, "/p-hr/instances", "p-hr")).toBe(true);
    expect(itemIsActive(homeItem, "/p-hr/instances/runtime-1", "p-hr")).toBe(true);
    expect(itemIsActive(homeItem, "/p-hr/memory", "p-hr")).toBe(true);
    expect(itemIsActive(homeItem, "/p-hr/skills", "p-hr")).toBe(false);
  });

  it("keeps nested resource pages active within their visible navigation item", () => {
    const specialistAgents = navGroups[0]!.items[0]!;
    const accessPolicies = navGroups[1]!.items[0]!;
    expect(
      itemIsActive(specialistAgents, "/p-hr/agent-garden/catalog-agent", "p-hr"),
    ).toBe(true);
    expect(
      itemIsActive(accessPolicies, "/p-hr/access-policies/policy-1", "p-hr"),
    ).toBe(true);
  });
});
