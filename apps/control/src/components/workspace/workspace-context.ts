import { createContext } from "react";
import type { Workspace } from "@/types/workspace";

export const WORKSPACE_CHANGED_EVENT = "workspace.changed";

export interface WorkspaceContextValue {
  availableWorkspaces: Workspace[];
  currentWorkspace: Workspace | null;
  error: string;
  loading: boolean;
  refreshWorkspaces: () => Promise<Workspace[]>;
  switchWorkspace: (workspaceId: string) => Promise<void>;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(
  null,
);

export const personalFallbackWorkspace: Workspace = {
  id: "individual",
  name: "Individual",
  type: "personal",
  memberCount: 1,
  role: "owner",
};

export function selectInitialWorkspace(
  workspaces: Workspace[],
  urlWorkspaceId: string | null,
  storedWorkspaceId: string | null,
): Workspace {
  return (
    workspaces.find((workspace) => workspace.id === urlWorkspaceId) ??
    workspaces.find((workspace) => workspace.id === storedWorkspaceId) ??
    workspaces[0] ??
    personalFallbackWorkspace
  );
}
