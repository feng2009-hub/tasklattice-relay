import { describe, expect, it } from "vitest";
import { getNavGroups, itemIsActive, navGroups } from "./app-shell";

describe("Project control-plane navigation", () => {
  it("uses Home as a section label with Instances and Memory beneath it", () => {
    expect(navGroups.map((group) => group.label)).toEqual([
      "Home",
      "Capability toolbox",
      "Governance",
      "Evidence",
    ]);
    expect(navGroups.map((group) => group.items.map((item) => item.label))).toEqual([
      ["Instances", "Memory"],
      ["Specialist Agents", "Skills", "MCP Connections", "Knowledge Sources"],
      ["Access Policies", "Runtime Policies", "Project Settings"],
      ["Traces", "Audit Logs", "Cost"],
    ]);
    expect(navGroups.flatMap((group) => group.items.map((item) => item.label))).not.toContain("Home");
  });

  it("localizes every navigation group and item for Simplified Chinese", () => {
    const chineseGroups = getNavGroups("zh-CN");
    expect(chineseGroups.map((group) => group.label)).toEqual([
      "主页",
      "能力工具箱",
      "治理",
      "运行记录",
    ]);
    expect(chineseGroups.map((group) => group.items.map((item) => item.label))).toEqual([
      ["实例", "记忆"],
      ["专家智能体", "技能", "MCP 连接", "知识源"],
      ["访问策略", "运行时策略", "项目设置"],
      ["追踪记录", "审计日志", "成本"],
    ]);
  });

  it("gives Instances and Memory their own active states", () => {
    const instances = navGroups[0]!.items[0]!;
    const memory = navGroups[0]!.items[1]!;
    expect(itemIsActive(instances, "/p-hr/instances", "p-hr")).toBe(true);
    expect(itemIsActive(instances, "/p-hr/instances/runtime-1", "p-hr")).toBe(true);
    expect(itemIsActive(instances, "/p-hr/memory", "p-hr")).toBe(false);
    expect(itemIsActive(memory, "/p-hr/memory", "p-hr")).toBe(true);
    expect(itemIsActive(memory, "/p-hr/instances", "p-hr")).toBe(false);
  });

  it("keeps nested resource pages active within their visible navigation item", () => {
    const specialistAgents = navGroups[1]!.items[0]!;
    const accessPolicies = navGroups[2]!.items[0]!;
    expect(
      itemIsActive(specialistAgents, "/p-hr/agent-garden/catalog-agent", "p-hr"),
    ).toBe(true);
    expect(
      itemIsActive(accessPolicies, "/p-hr/access-policies/policy-1", "p-hr"),
    ).toBe(true);
  });
});
