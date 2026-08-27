import { describe, expect, it } from "vitest";
import { permissionsForCapabilities } from "./use-project-permissions";

describe("permissionsForCapabilities", () => {
  it("derives controls from API capabilities instead of a role name", () => {
    expect(permissionsForCapabilities([
      "CAP_PROJECT_DELETE",
      "CAP_PROJECT_MEMBER_INVITE",
      "CAP_PROJECT_MEMBER_REMOVE",
      "CAP_PROJECT_MEMBER_ROLE_ASSIGN",
      "CAP_PROJECT_SETTINGS_UPDATE",
      "CAP_AUDIT_DETAIL_VIEW",
      "CAP_SKILL_VIEW",
    ])).toEqual({
      canCreateAgents: false,
      canDeleteAgents: false,
      canInteractWithAgents: false,
      canViewAgentLogs: false,
      canUseAgentTerminal: false,
      canViewSensitiveAgentAudit: false,
      canCreateProject: false,
      canDeleteProject: true,
      canInviteMembers: true,
      canRemoveMembers: true,
      canAssignRoles: true,
      canManageResources: false,
      canViewVectorDatabases: false,
      canViewVectorDatabaseContent: false,
      canCreateVectorDatabases: false,
      canUpdateVectorDatabases: false,
      canDeleteVectorDatabases: false,
      canManageProject: true,
      canViewAuditLogs: true,
      canViewResources: true,
    });
  });

  it("does not infer unrelated controls from a granted capability", () => {
    expect(permissionsForCapabilities(["CAP_AGENT_INSTANCE_CREATE"])).toEqual({
      canCreateAgents: true,
      canDeleteAgents: false,
      canInteractWithAgents: false,
      canViewAgentLogs: false,
      canUseAgentTerminal: false,
      canViewSensitiveAgentAudit: false,
      canCreateProject: false,
      canDeleteProject: false,
      canInviteMembers: false,
      canRemoveMembers: false,
      canAssignRoles: false,
      canManageResources: false,
      canViewVectorDatabases: false,
      canViewVectorDatabaseContent: false,
      canCreateVectorDatabases: false,
      canUpdateVectorDatabases: false,
      canDeleteVectorDatabases: false,
      canManageProject: false,
      canViewAuditLogs: false,
      canViewResources: false,
    });
  });

  it("keeps invite, removal, and role assignment independent", () => {
    expect(
      permissionsForCapabilities(["CAP_PROJECT_MEMBER_INVITE"]),
    ).toMatchObject({
      canInviteMembers: true,
      canRemoveMembers: false,
      canAssignRoles: false,
    });
  });

  it("keeps the Department-scoped Project create gate explicit", () => {
    expect(
      permissionsForCapabilities([], { canCreateProject: true })
        .canCreateProject,
    ).toBe(true);
  });

  it("keeps Vector Database inventory, content, and mutation gates independent", () => {
    expect(permissionsForCapabilities([
      "CAP_VECTOR_DATABASE_VIEW",
      "CAP_VECTOR_DATABASE_CONTENT_VIEW",
      "CAP_VECTOR_DATABASE_UPDATE",
    ])).toMatchObject({
      canViewVectorDatabases: true,
      canViewVectorDatabaseContent: true,
      canCreateVectorDatabases: false,
      canUpdateVectorDatabases: true,
      canDeleteVectorDatabases: false,
    });
  });

  it("does not conflate configuration, interaction, terminal, and audit access", () => {
    expect(permissionsForCapabilities([
      "CAP_AGENT_INSTANCE_INTERACT",
      "CAP_AUDIT_DETAIL_VIEW",
    ])).toMatchObject({
      canInteractWithAgents: true,
      canViewAgentLogs: false,
      canUseAgentTerminal: false,
      canViewSensitiveAgentAudit: false,
    });
    expect(permissionsForCapabilities([
      "CAP_AUDIT_DETAIL_VIEW",
      "CAP_AUDIT_SENSITIVE_CONTENT_VIEW",
    ]).canViewSensitiveAgentAudit).toBe(true);
  });
});
