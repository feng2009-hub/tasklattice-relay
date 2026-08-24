export interface DepartmentSummary {
  id: string;
  name: string;
  description?: string;
  hardBudgetUsd: number | null;
  allocatedBudgetUsd: number;
  memberCount: number;
  projectCount: number;
  role: "administrator";
  status: "active" | "suspended";
}

export interface DepartmentDetail extends DepartmentSummary {
  createdAt: string;
  members: Array<{
    id: string;
    displayName: string;
    email: string;
    role: "administrator" | "member";
    status: "active" | "suspended";
    projects: Array<{
      id: string;
      name: string;
      roles: Array<"admin" | "auditor" | "developer" | "user" | "reviewer">;
    }>;
  }>;
  projects: Array<{
    id: string;
    name: string;
    hardBudgetUsd: number | null;
    memberCount: number;
    instanceCount: number;
    mcpIntegrationCount: number;
    knowledgeBaseCount: number;
    modelCount: number;
    routingCount: number;
    inheritedSettingsRevision: number | null;
  }>;
}

export interface UpdateDepartmentInput {
  description: string | null;
  hardBudgetUsd: number | null;
  name: string;
}
