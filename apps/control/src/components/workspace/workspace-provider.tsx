import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useRouterState } from "@tanstack/react-router";
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
  const locationSignature = useRouterState({
    select: (state) =>
      `${state.location.pathname}?${JSON.stringify(state.location.search)}`,
  });
  const [availableWorkspaces, setAvailableWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
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
    setAvailableWorkspaces(workspaces);
    setCurrentWorkspace((current) => {
      if (!current) return workspaces[0] ?? personalFallbackWorkspace;
      return (
        workspaces.find((workspace) => workspace.id === current.id) ??
        workspaces[0] ??
        personalFallbackWorkspace
      );
    });
    return workspaces;
  }, []);

  useEffect(() => {
    let disposed = false;
    const initialize = async () => {
      setLoading(true);
      setError("");
      try {
        const loaded = await getWorkspaces();
        if (disposed) return;
        const workspaces = loaded.length ? loaded : [personalFallbackWorkspace];
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
      if (!nextWorkspace || nextWorkspace.id === currentWorkspace?.id) return;

      setLoading(true);
      setError("");
      try {
        await queryClient.cancelQueries();
        await persistWorkspaceSwitch(nextWorkspace.id);
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
        await queryClient.invalidateQueries({ refetchType: "none" });
        await queryClient.resetQueries({ type: "active" });
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to switch workspaces.",
        );
        throw reason;
      } finally {
        setLoading(false);
      }
    },
    [
      availableWorkspaces,
      currentWorkspace?.id,
      queryClient,
      replaceWorkspaceInUrl,
    ],
  );

  useEffect(() => {
    const syncFromHistory = () => {
      const workspaceId = workspaceIdFromUrl();
      if (workspaceId && workspaceId !== currentWorkspace?.id) {
        void switchWorkspace(workspaceId);
      }
    };
    window.addEventListener("popstate", syncFromHistory);
    return () => window.removeEventListener("popstate", syncFromHistory);
  }, [currentWorkspace?.id, switchWorkspace]);

  useEffect(() => {
    if (!currentWorkspace || loading) return;
    const workspaceId = workspaceIdFromUrl();
    if (!workspaceId) {
      replaceWorkspaceInUrl(currentWorkspace.id);
      return;
    }
    if (
      workspaceId !== currentWorkspace.id &&
      availableWorkspaces.some((workspace) => workspace.id === workspaceId)
    ) {
      void switchWorkspace(workspaceId);
    }
  }, [
    availableWorkspaces,
    currentWorkspace,
    loading,
    locationSignature,
    replaceWorkspaceInUrl,
    switchWorkspace,
  ]);

  const value = useMemo(
    () => ({
      availableWorkspaces,
      currentWorkspace,
      error,
      loading,
      refreshWorkspaces,
      switchWorkspace,
    }),
    [
      availableWorkspaces,
      currentWorkspace,
      error,
      loading,
      refreshWorkspaces,
      switchWorkspace,
    ],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}
