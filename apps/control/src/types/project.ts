export type ProjectType = "personal" | "team";

export type ProjectRole = "admin" | "member";

export interface Project {
  id: string;
  name: string;
  type: ProjectType;
  avatar?: string;
  memberCount: number;
  role: ProjectRole;
}

export interface HumanProjectMember {
  id: string;
  kind: "human";
  name: string;
  email: string;
  role: ProjectRole;
  status: "active" | "invited";
}

export interface ProjectPermissions {
  canCreateAgents: boolean;
  canCreateProject: boolean;
  canDeleteProject: boolean;
  canInviteMembers: boolean;
  canManageResources: boolean;
  canManageProject: boolean;
  canViewAuditLogs: boolean;
  canViewResources: boolean;
}
