import { useProject } from "@/hooks/use-project";
import type {
  ProjectPermissions,
  ProjectRole,
} from "@/types/project";

export function permissionsForRole(role: ProjectRole): ProjectPermissions {
  const isManager = role === "admin";
  return {
    canCreateAgents: true,
    canCreateProject: isManager,
    canDeleteProject: role === "admin",
    canInviteMembers: isManager,
    canManageResources: isManager,
    canManageProject: isManager,
    canViewAuditLogs: isManager,
    canViewResources: true,
  };
}

export function useProjectPermissions(
  role?: ProjectRole,
): ProjectPermissions {
  const { currentProject } = useProject();
  return permissionsForRole(role ?? currentProject?.role ?? "member");
}
