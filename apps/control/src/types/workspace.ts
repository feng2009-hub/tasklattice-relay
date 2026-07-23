export type WorkspaceType = "personal" | "team";

export type WorkspaceRole = "owner" | "admin" | "member";

export interface Workspace {
  id: string;
  name: string;
  type: WorkspaceType;
  avatar?: string;
  memberCount: number;
  role: WorkspaceRole;
}

export interface WorkspaceMember {
  id: string;
  name: string;
  email: string;
  role: WorkspaceRole;
  status: "active" | "invited";
}

export interface WorkspacePermissions {
  canCreateAgents: boolean;
  canCreateWorkspace: boolean;
  canDeleteWorkspace: boolean;
  canInviteMembers: boolean;
  canManageExtensions: boolean;
  canManageWorkspace: boolean;
  canViewResources: boolean;
}
