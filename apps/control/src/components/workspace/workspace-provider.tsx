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

function workspaceIdFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URL(window.location.href).searchParams.get("workspace");
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [availableWorkspaces, setAvailableWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [switchingWorkspaceId, setSwitchingWorkspaceId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const replaceWorkspaceInUrl = useCallback(
    (workspaceId: string) => {
      if (typeof window === "undefined") return;
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set("workspace", workspaceId);
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
    setError(selected ? "" : "No workspace available.");
    if (selected) {
      storeWorkspaceId(selected.id);
      replaceWorkspaceInUrl(selected.id);
    }
    return workspaces;
  }, [currentWorkspace?.id, replaceWorkspaceInUrl]);

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
          setError("No workspace available.");
          return;
        }
        const workspaces = loaded;
        const urlWorkspaceId = workspaceIdFromUrl();
        const storedWorkspaceId = getStoredWorkspaceId();
        const selected = selectInitialWorkspace(
          workspaces,
          urlWorkspaceId,
          storedWorkspaceId,
        );
        setAvailableWorkspaces(workspaces);
        setCurrentWorkspace(selected);
        storeWorkspaceId(selected.id);
        replaceWorkspaceInUrl(selected.id);
      } catch (reason) {
        if (disposed) return;
        setAvailableWorkspaces([personalFallbackWorkspace]);
        setCurrentWorkspace(personalFallbackWorkspace);
        storeWorkspaceId(personalFallbackWorkspace.id);
        replaceWorkspaceInUrl(personalFallbackWorkspace.id);
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to load workspaces. Using the personal workspace.",
        );
      } finally {
        if (!disposed) setLoading(false);
      }
    };
    void initialize();
    return () => {
      disposed = true;
    };
  }, [replaceWorkspaceInUrl]);

  const switchWorkspace = useCallback(
    async (workspaceId: string) => {
      const nextWorkspace = availableWorkspaces.find(
        (workspace) => workspace.id === workspaceId,
      );
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
        replaceWorkspaceInUrl(nextWorkspace.id);
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
            : "Unable to switch workspaces.",
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
      replaceWorkspaceInUrl,
      switchingWorkspaceId,
    ],
  );

  useEffect(() => {
    const syncFromHistory = () => {
      const workspaceId = workspaceIdFromUrl();
      if (!currentWorkspace) return;
      if (!workspaceId) {
        replaceWorkspaceInUrl(currentWorkspace.id);
        return;
      }
      if (workspaceId === currentWorkspace.id) return;
      if (availableWorkspaces.some((workspace) => workspace.id === workspaceId)) {
        void switchWorkspace(workspaceId);
      } else {
        replaceWorkspaceInUrl(currentWorkspace.id);
      }
    };
    window.addEventListener("popstate", syncFromHistory);
    return () => window.removeEventListener("popstate", syncFromHistory);
  }, [
    availableWorkspaces,
    currentWorkspace,
    replaceWorkspaceInUrl,
    switchWorkspace,
  ]);

  const value = useMemo(
    () => ({
      availableWorkspaces,
      currentWorkspace,
      error,
      isSwitching: switchingWorkspaceId !== null,
      loading,
      refreshWorkspaces,
      switchingWorkspaceId,
      switchWorkspace,
    }),
    [
      availableWorkspaces,
      currentWorkspace,
      error,
      loading,
      refreshWorkspaces,
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
