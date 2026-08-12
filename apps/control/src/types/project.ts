import type { ProjectCapability, ProjectMembershipRole } from "@tali/contracts";

export type ProjectType = "personal" | "team";

export type ProjectRole = ProjectMembershipRole;

export const projectRoleLabels: Record<ProjectRole, string> = {
  admin: "Project Administrator",
  auditor: "Auditor",
  developer: "Agent Developer",
  user: "User",
  approver: "Approver",
};

export interface Project {
  id: string;
  name: string;
  type: ProjectType;
  avatar?: string;
  memberCount: number;
  role: ProjectRole;
  authorizationEnvironment: "DEV" | "UAT" | "PROD";
  effectiveCapabilities: readonly ProjectCapability[];
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
  canDeleteAgents: boolean;
  canInteractWithAgents: boolean;
  canViewAgentLogs: boolean;
  canUseAgentTerminal: boolean;
  canViewSensitiveAgentAudit: boolean;
  canCreateProject: boolean;
  canDeleteProject: boolean;
  canInviteMembers: boolean;
  canRemoveMembers: boolean;
  canAssignRoles: boolean;
  canManageResources: boolean;
  canManageProject: boolean;
  canViewAuditLogs: boolean;
  canViewResources: boolean;
}
