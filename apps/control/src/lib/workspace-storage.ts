export const CURRENT_WORKSPACE_STORAGE_KEY = "currentWorkspace";

export function getStoredWorkspaceId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(CURRENT_WORKSPACE_STORAGE_KEY);
}

export function storeWorkspaceId(workspaceId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CURRENT_WORKSPACE_STORAGE_KEY, workspaceId);
}

export function clearStoredWorkspaceId(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CURRENT_WORKSPACE_STORAGE_KEY);
}
