import { describe, expect, it } from "vitest";
import { getHeaderBreadcrumbItems } from "./header-breadcrumb";

describe("getHeaderBreadcrumbItems", () => {
  it.each([
    ["instances", "Runtime Instances"],
    ["memory", "Memory"],
    ["agent-garden", "Agent Garden"],
    ["skills", "Skills"],
    ["mcp-servers", "MCP Servers"],
    ["knowledge-base", "Knowledge Base"],
    ["access-policies", "Access Policies"],
    ["runtime-policies", "Runtime Policies"],
    ["setting", "Project Settings"],
    ["traces", "Traces"],
    ["audit-logs", "Audit Logs"],
    ["cost", "Cost"],
    ["help", "Help & documentation"],
  ])("keeps %s directly beneath the Project", (segment, label) => {
    expect(getHeaderBreadcrumbItems(`/individual/${segment}`)).toEqual([
      { href: `/individual/${segment}`, label },
    ]);
  });

  it("localizes the Help breadcrumb in Simplified Chinese", () => {
    expect(getHeaderBreadcrumbItems("/individual/help", "zh-CN")).toEqual([
      { href: "/individual/help", label: "帮助与文档" },
    ]);
  });

  it("keeps only the real resource hierarchy for Instance details", () => {
    expect(getHeaderBreadcrumbItems("/web3/instances/devops")).toEqual([
      { href: "/web3/instances", label: "Runtime Instances" },
      { href: "/web3/instances/devops", label: "Instance details" },
    ]);
  });

  it("uses canonical request language", () => {
    expect(getHeaderBreadcrumbItems("/individual/requests/new")).toEqual([
      { href: "/individual/requests", label: "Requests" },
      { href: "/individual/requests/new", label: "Raise Request" },
    ]);
  });

  it("distinguishes Account from Project settings", () => {
    expect(getHeaderBreadcrumbItems("/individual/profile")).toEqual([
      { href: "/individual/profile", label: "Account" },
    ]);
    expect(getHeaderBreadcrumbItems("/individual/setting")).toEqual([
      { href: "/individual/setting", label: "Project Settings" },
    ]);
  });

  it("uses a stable label for Agent marketplace details", () => {
    expect(
      getHeaderBreadcrumbItems(
        "/individual/agent-garden/adk-customer-service",
      ),
    ).toEqual([
      {
        href: "/individual/agent-garden",
        label: "Agent Garden",
      },
      {
        href: "/individual/agent-garden/adk-customer-service",
        label: "Agent details",
      },
    ]);
  });

  it("uses route-aware labels for nested Project settings", () => {
    expect(
      getHeaderBreadcrumbItems(
        "/individual/setting/model-routings/routing%2Fprimary",
      ),
    ).toEqual([
      { href: "/individual/setting", label: "Project Settings" },
      {
        href: "/individual/setting/model-routings",
        label: "Routing",
      },
      {
        href: "/individual/setting/model-routings/routing%2Fprimary",
        label: "Routing details",
      },
    ]);
  });

  it("does not mistake a dynamic resource id for a route label", () => {
    expect(getHeaderBreadcrumbItems("/individual/instances/memory")).toEqual([
      { href: "/individual/instances", label: "Runtime Instances" },
      {
        href: "/individual/instances/memory",
        label: "Instance details",
      },
    ]);
  });
});
