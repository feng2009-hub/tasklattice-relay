import { useWorkspace } from "@/hooks/use-workspace";
import type {
  WorkspacePermissions,
  WorkspaceRole,
} from "@/types/workspace";

export function permissionsForRole(role: WorkspaceRole): WorkspacePermissions {
  const isManager = role === "owner" || role === "admin";
  return {
    canCreateAgents: true,
    canCreateWorkspace: isManager,
    canDeleteWorkspace: role === "owner",
    canInviteMembers: isManager,
    canManageExtensions: isManager,
    canManageWorkspace: isManager,
    canViewResources: true,
  };
}

export function useWorkspacePermissions(
  role?: WorkspaceRole,
): WorkspacePermissions {
  const { currentWorkspace } = useWorkspace();
  return permissionsForRole(role ?? currentWorkspace?.role ?? "member");
}
