import { describe, expect, it } from "vitest";
import { getHeaderBreadcrumbItems } from "./header-breadcrumb";

describe("getHeaderBreadcrumbItems", () => {
  it("maps provider routes to the product breadcrumb language", () => {
    expect(getHeaderBreadcrumbItems("/providers/cost")).toEqual([
      { href: "/providers", label: "Models" },
      { href: "/providers/cost", label: "Cost" },
    ]);
  });

  it("keeps the current resource identity for dynamic routes", () => {
    expect(getHeaderBreadcrumbItems("/agents/devops")).toEqual([
      { href: "/agents", label: "Instances" },
      { href: "/agents/devops", label: "devops" },
    ]);
  });

  it("removes the legacy misspelled route segment from create-instance paths", () => {
    expect(getHeaderBreadcrumbItems("/agents/instace/new")).toEqual([
      { href: "/agents", label: "Instances" },
      { href: "/agents/instace/new", label: "Create Instance" },
    ]);
  });
});
