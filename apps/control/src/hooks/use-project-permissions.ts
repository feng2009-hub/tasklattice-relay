import { useProject } from "@/hooks/use-project";
import type { ProjectPermissions } from "@/types/project";
import type { ProjectCapability } from "@tali/contracts";

export function permissionsForCapabilities(
  capabilities: readonly ProjectCapability[],
  options: { canCreateProject?: boolean } = {},
): ProjectPermissions {
  const granted = new Set(capabilities);
  return {
    canCreateAgents: granted.has("CAP_AGENT_INSTANCE_CREATE"),
    canDeleteAgents: granted.has("CAP_AGENT_INSTANCE_DELETE"),
    canInteractWithAgents: granted.has("CAP_AGENT_INSTANCE_INTERACT"),
    canViewAgentLogs: granted.has("CAP_AGENT_INSTANCE_LOG_VIEW"),
    canUseAgentTerminal: granted.has("CAP_AGENT_INSTANCE_TERMINAL_EXEC"),
    canViewSensitiveAgentAudit:
      granted.has("CAP_AUDIT_DETAIL_VIEW")
      && granted.has("CAP_AUDIT_SENSITIVE_CONTENT_VIEW"),
    canCreateProject: options.canCreateProject ?? false,
    canDeleteProject: granted.has("CAP_PROJECT_DELETE"),
    canInviteMembers: granted.has("CAP_PROJECT_MEMBER_INVITE"),
    canRemoveMembers: granted.has("CAP_PROJECT_MEMBER_REMOVE"),
    canAssignRoles: granted.has("CAP_PROJECT_MEMBER_ROLE_ASSIGN"),
    canManageResources: [
      "CAP_SKILL_CREATE",
      "CAP_MCP_SERVER_CREATE",
      "CAP_KNOWLEDGE_SOURCE_CREATE",
      "CAP_PROVIDER_CREATE",
    ].some((capability) => granted.has(capability as ProjectCapability)),
    canManageProject: granted.has("CAP_PROJECT_SETTINGS_UPDATE"),
    canViewAuditLogs:
      granted.has("CAP_AUDIT_VIEW") || granted.has("CAP_AUDIT_DETAIL_VIEW"),
    canViewResources: [
      "CAP_SKILL_VIEW",
      "CAP_MCP_SERVER_VIEW",
      "CAP_KNOWLEDGE_SOURCE_VIEW",
    ].some((capability) => granted.has(capability as ProjectCapability)),
  };
}

export function useProjectPermissions(): ProjectPermissions {
  const { currentProject } = useProject();

  return permissionsForCapabilities(
    currentProject?.effectiveCapabilities ?? [],
    {
      // Project creation is a system-scoped entitlement granted to every
      // active authenticated user, independent of the selected Project role.
      canCreateProject: Boolean(currentProject),
    },
  );
}
