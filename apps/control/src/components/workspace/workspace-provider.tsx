import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import {
  getStoredWorkspaceId,
  storeWorkspaceId,
} from "@/lib/workspace-storage";
import {
  getWorkspaces,
  switchWorkspace as persistWorkspaceSwitch,
} from "@/services/workspace";
import {
  personalFallbackWorkspace,
  selectInitialWorkspace,
  WORKSPACE_CHANGED_EVENT,
  WorkspaceContext,
} from "@/components/workspace/workspace-context";
import type { Workspace } from "@/types/workspace";

function projectIdFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URL(window.location.href).searchParams.get("project_id");
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [availableWorkspaces, setAvailableWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [switchingWorkspaceId, setSwitchingWorkspaceId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const replaceProjectInUrl = useCallback(
    (projectId: string) => {
      if (typeof window === "undefined") return;
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set("project_id", projectId);
      router.history.replace(
        `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`,
      );
    },
    [router],
  );

  const refreshWorkspaces = useCallback(async () => {
    const workspaces = await getWorkspaces();
    const selected =
      workspaces.find((workspace) => workspace.id === currentWorkspace?.id) ??
      workspaces.find((workspace) => workspace.type === "personal") ??
      workspaces[0] ??
      null;
    setAvailableWorkspaces(workspaces);
    setCurrentWorkspace(selected);
    setError(selected ? "" : "No project available.");
    if (selected) {
      storeWorkspaceId(selected.id);
      replaceProjectInUrl(selected.id);
    }
    return workspaces;
  }, [currentWorkspace?.id, replaceProjectInUrl]);

  useEffect(() => {
    let disposed = false;
    const initialize = async () => {
      setLoading(true);
      setError("");
      try {
        const loaded = await getWorkspaces();
        if (disposed) return;
        if (!loaded.length) {
          setAvailableWorkspaces([]);
          setCurrentWorkspace(null);
          setError("No project available.");
          return;
        }
        const workspaces = loaded;
        const urlWorkspaceId = projectIdFromUrl();
        const storedWorkspaceId = getStoredWorkspaceId();
        const selected = selectInitialWorkspace(
          workspaces,
          urlWorkspaceId,
          storedWorkspaceId,
        );
        setAvailableWorkspaces(workspaces);
        setCurrentWorkspace(selected);
        storeWorkspaceId(selected.id);
        replaceProjectInUrl(selected.id);
      } catch (reason) {
        if (disposed) return;
        setAvailableWorkspaces([personalFallbackWorkspace]);
        setCurrentWorkspace(personalFallbackWorkspace);
        storeWorkspaceId(personalFallbackWorkspace.id);
        replaceProjectInUrl(personalFallbackWorkspace.id);
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to load projects. Using the default project.",
        );
      } finally {
        if (!disposed) setLoading(false);
      }
    };
    void initialize();
    return () => {
      disposed = true;
    };
  }, [replaceProjectInUrl]);

  const selectProject = useCallback(
    async (projectId: string) => {
      let projectList = availableWorkspaces;
      let nextWorkspace = projectList.find(
        (workspace) => workspace.id === projectId,
      );
      if (!nextWorkspace) {
        projectList = await getWorkspaces();
        setAvailableWorkspaces(projectList);
        nextWorkspace = projectList.find((workspace) => workspace.id === projectId);
      }
      if (
        switchingWorkspaceId ||
        !nextWorkspace ||
        nextWorkspace.id === currentWorkspace?.id
      ) return;

      setSwitchingWorkspaceId(nextWorkspace.id);
      setError("");
      try {
        await persistWorkspaceSwitch(nextWorkspace.id);
        if (currentWorkspace) {
          await queryClient.cancelQueries({
            queryKey: ["workspace", currentWorkspace.id],
          });
        }
        await queryClient.invalidateQueries({
          queryKey: ["workspace", nextWorkspace.id],
          refetchType: "none",
        });
        setCurrentWorkspace(nextWorkspace);
        replaceProjectInUrl(nextWorkspace.id);
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent(WORKSPACE_CHANGED_EVENT, {
              detail: {
                previousWorkspaceId: currentWorkspace?.id,
                workspaceId: nextWorkspace.id,
              },
            }),
          );
        }
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to switch projects.",
        );
        throw reason;
      } finally {
        setSwitchingWorkspaceId(null);
      }
    },
    [
      availableWorkspaces,
      currentWorkspace?.id,
      queryClient,
      replaceProjectInUrl,
      switchingWorkspaceId,
    ],
  );

  const switchWorkspace = selectProject;

  useEffect(() => {
    const syncFromHistory = () => {
      const workspaceId = projectIdFromUrl();
      if (!currentWorkspace) return;
      if (!workspaceId) {
        replaceProjectInUrl(currentWorkspace.id);
        return;
      }
      if (workspaceId === currentWorkspace.id) return;
      if (availableWorkspaces.some((workspace) => workspace.id === workspaceId)) {
        void selectProject(workspaceId);
      } else {
        replaceProjectInUrl(currentWorkspace.id);
      }
    };
    window.addEventListener("popstate", syncFromHistory);
    return () => window.removeEventListener("popstate", syncFromHistory);
  }, [
    availableWorkspaces,
    currentWorkspace,
    replaceProjectInUrl,
    selectProject,
  ]);

  const value = useMemo(
    () => ({
      availableWorkspaces,
      currentWorkspace,
      error,
      isSwitching: switchingWorkspaceId !== null,
      loading,
      refreshWorkspaces,
      selectProject,
      switchingWorkspaceId,
      switchWorkspace,
    }),
    [
      availableWorkspaces,
      currentWorkspace,
      error,
      loading,
      refreshWorkspaces,
      selectProject,
      switchingWorkspaceId,
      switchWorkspace,
    ],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}
