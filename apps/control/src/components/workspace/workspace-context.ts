import { createContext } from "react";
import type { Workspace } from "@/types/workspace";

export const WORKSPACE_CHANGED_EVENT = "workspace.changed";

export interface WorkspaceContextValue {
  availableWorkspaces: Workspace[];
  currentWorkspace: Workspace | null;
  error: string;
  isSwitching: boolean;
  loading: boolean;
  refreshWorkspaces: () => Promise<Workspace[]>;
  switchingWorkspaceId: string | null;
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
  const personalWorkspace =
    workspaces.find((workspace) => workspace.type === "personal") ??
    workspaces[0] ??
    personalFallbackWorkspace;
  if (urlWorkspaceId) {
    return (
      workspaces.find((workspace) => workspace.id === urlWorkspaceId) ??
      personalWorkspace
    );
  }
  return (
    workspaces.find((workspace) => workspace.id === storedWorkspaceId) ??
    personalWorkspace
  );
}
