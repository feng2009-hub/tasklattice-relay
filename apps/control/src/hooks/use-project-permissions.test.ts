import { describe, expect, it } from "vitest";
import { permissionsForRole } from "./use-project-permissions";

describe("permissionsForRole", () => {
  it("grants administrators all project management capabilities", () => {
    expect(permissionsForRole("admin")).toEqual({
      canCreateAgents: true,
      canCreateProject: true,
      canDeleteProject: true,
      canInviteMembers: true,
      canManageExtensions: true,
      canManageProject: true,
      canViewResources: true,
    });
  });

  it("keeps members as a strict subset of administrator capabilities", () => {
    expect(permissionsForRole("member")).toEqual({
      canCreateAgents: true,
      canCreateProject: false,
      canDeleteProject: false,
      canInviteMembers: false,
      canManageExtensions: false,
      canManageProject: false,
      canViewResources: true,
    });
  });
});
