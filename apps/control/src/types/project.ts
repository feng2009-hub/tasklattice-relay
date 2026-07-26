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

export interface VirtualProjectMember {
  id: string;
  kind: "virtual";
  name: string;
  businessRole?: string;
  environment: string;
  role: "virtual_employee";
  status: VirtualEmployeeStatus;
}

export type ProjectMember = HumanProjectMember | VirtualProjectMember;

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
import type { VirtualEmployeeStatus } from "@tasklattice/contracts";
