import { useWorkspace } from "@/hooks/use-workspace";

export function useSwitchWorkspace() {
  const { loading, switchWorkspace } = useWorkspace();
  return { loading, switchWorkspace };
}
