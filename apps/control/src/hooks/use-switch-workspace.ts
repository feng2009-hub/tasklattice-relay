import { useWorkspace } from "@/hooks/use-workspace";

export function useSwitchWorkspace() {
  const { isSwitching, switchingWorkspaceId, switchWorkspace } = useWorkspace();
  return { isSwitching, switchingWorkspaceId, switchWorkspace };
}
