import { useMemo } from "react";
import { useWorkspace } from "@/hooks/use-workspace";

export function workspaceQueryKey<const Parts extends readonly unknown[]>(
  workspaceId: string,
  ...parts: Parts
) {
  return ["workspace", workspaceId, ...parts] as const;
}

export function useWorkspaceQueryScope() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id ?? "unavailable";

  return useMemo(
    () => ({
      key: <const Parts extends readonly unknown[]>(...parts: Parts) =>
        workspaceQueryKey(workspaceId, ...parts),
      workspaceId,
    }),
    [workspaceId],
  );
}
