import { describe, expect, it } from "vitest";
import { permissionsForRole } from "./use-project-permissions";

describe("permissionsForRole", () => {
  it("grants administrators all project management capabilities", () => {
    expect(permissionsForRole("admin")).toEqual({
      canCreateAgents: true,
      canCreateProject: true,
      canDeleteProject: true,
      canInviteMembers: true,
      canManageResources: true,
      canManageProject: true,
      canViewAuditLogs: true,
      canViewResources: true,
    });
  });

  it("keeps members as a strict subset of administrator capabilities", () => {
    expect(permissionsForRole("member")).toEqual({
      canCreateAgents: true,
      canCreateProject: false,
      canDeleteProject: false,
      canInviteMembers: false,
      canManageResources: false,
      canManageProject: false,
      canViewAuditLogs: false,
      canViewResources: true,
    });
  });
});
