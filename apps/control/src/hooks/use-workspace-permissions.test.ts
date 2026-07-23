import { describe, expect, it } from "vitest";
import { permissionsForRole } from "./use-workspace-permissions";

describe("permissionsForRole", () => {
  it("grants owners all workspace management capabilities", () => {
    expect(permissionsForRole("owner")).toEqual({
      canCreateAgents: true,
      canCreateWorkspace: true,
      canDeleteWorkspace: true,
      canInviteMembers: true,
      canManageExtensions: true,
      canManageWorkspace: true,
      canViewResources: true,
    });
  });

  it("prevents admins from deleting workspaces", () => {
    expect(permissionsForRole("admin")).toMatchObject({
      canDeleteWorkspace: false,
      canInviteMembers: true,
      canManageExtensions: true,
      canManageWorkspace: true,
    });
  });

  it("keeps members in a resource-using, view-only management role", () => {
    expect(permissionsForRole("member")).toEqual({
      canCreateAgents: true,
      canCreateWorkspace: false,
      canDeleteWorkspace: false,
      canInviteMembers: false,
      canManageExtensions: false,
      canManageWorkspace: false,
      canViewResources: true,
    });
  });
});
