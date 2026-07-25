import { describe, expect, it } from "vitest";
import { getHeaderBreadcrumbItems } from "./header-breadcrumb";

describe("getHeaderBreadcrumbItems", () => {
  it("maps provider routes to the product breadcrumb language", () => {
    expect(getHeaderBreadcrumbItems("/individual/cost")).toEqual([
      { href: "/individual/models", label: "Models" },
      { href: "/individual/cost", label: "Cost" },
    ]);
  });

  it("keeps the current resource identity for dynamic routes", () => {
    expect(getHeaderBreadcrumbItems("/web3/instances/devops")).toEqual([
      { href: "/web3/instances", label: "Instances" },
      { href: "/web3/instances/devops", label: "devops" },
    ]);
  });

  it("uses canonical request language", () => {
    expect(getHeaderBreadcrumbItems("/individual/requests/new")).toEqual([
      { href: "/individual/requests", label: "Requests" },
      { href: "/individual/requests/new", label: "Raise Request" },
    ]);
  });

  it("distinguishes My Account from Project settings", () => {
    expect(getHeaderBreadcrumbItems("/individual/profile")).toEqual([
      { href: "/individual/profile", label: "My Account" },
    ]);
    expect(getHeaderBreadcrumbItems("/individual/setting")).toEqual([
      { href: "/individual/setting", label: "Project Settings" },
    ]);
  });
});
