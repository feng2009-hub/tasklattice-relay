export const CURRENT_PROJECT_STORAGE_KEY = "currentProject";

export function getStoredWorkspaceId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(CURRENT_PROJECT_STORAGE_KEY);
}

export function storeWorkspaceId(workspaceId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CURRENT_PROJECT_STORAGE_KEY, workspaceId);
}

export function clearStoredWorkspaceId(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CURRENT_PROJECT_STORAGE_KEY);
}
