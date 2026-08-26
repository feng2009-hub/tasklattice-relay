import { describe, expect, it } from "vitest";
import type { AccessContextOption } from "@/services/access-context";
import { routeMatchesAccessContext } from "./access-context-guard";

function option(
  input: Pick<AccessContextOption, "level" | "resourceId" | "roleId" | "target">,
): AccessContextOption {
  return {
    description: "Assigned access",
    id: `${input.level}:${input.resourceId ?? "global"}:${input.roleId}`,
    resourceName: input.resourceId ?? "TaskLattice Relay",
    roleLabel: "Administrator",
    ...input,
  };
}

describe("routeMatchesAccessContext", () => {
  it("keeps Platform access inside Platform settings and global Account utilities", () => {
    const platform = option({
      level: "platform",
      resourceId: null,
      roleId: "ROLE_PLATFORM_ADMIN",
      target: "/platform/settings",
    });

    expect(routeMatchesAccessContext("/platform/settings", platform)).toBe(true);
    expect(routeMatchesAccessContext("/account", platform)).toBe(true);
    expect(routeMatchesAccessContext("/individual/help", platform)).toBe(true);
    expect(routeMatchesAccessContext("/departments/dep1", platform)).toBe(false);
    expect(routeMatchesAccessContext("/individual/instances", platform)).toBe(false);
  });

  it("keeps Department access inside the selected Department", () => {
    const department = option({
      level: "department",
      resourceId: "dep1",
      roleId: "ROLE_DEPARTMENT_ADMIN",
      target: "/departments/dep1",
    });

    expect(routeMatchesAccessContext("/departments/dep1", department)).toBe(true);
    expect(routeMatchesAccessContext("/departments/dep2", department)).toBe(false);
    expect(routeMatchesAccessContext("/platform/settings", department)).toBe(false);
  });

  it("keeps Project access inside the selected Project", () => {
    const project = option({
      level: "project",
      resourceId: "individual",
      roleId: "ROLE_PROJECT_ADMIN",
      target: "/individual/instances",
    });

    expect(routeMatchesAccessContext("/individual/instances", project)).toBe(true);
    expect(routeMatchesAccessContext("/individual/setting", project)).toBe(true);
    expect(routeMatchesAccessContext("/another/instances", project)).toBe(false);
    expect(routeMatchesAccessContext("/platform/settings", project)).toBe(false);
  });
});
