import { getAuthToken } from "@/lib/auth-token";
import {
  getStoredWorkspaceId,
  storeWorkspaceId,
} from "@/lib/workspace-storage";
import type {
  Workspace,
  WorkspaceMember,
  WorkspaceRole,
} from "@/types/workspace";

async function workspaceRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const workspaceId = getStoredWorkspaceId();
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(workspaceId ? { "x-workspace-id": workspaceId } : {}),
      ...init?.headers,
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) as T | { error?: string; message?: string } : undefined;
  if (!response.ok) {
    const error = payload as { error?: string; message?: string } | undefined;
    throw new Error(error?.message ?? error?.error ?? `Request failed (${response.status}).`);
  }
  return payload as T;
}

export async function getWorkspaces(): Promise<Workspace[]> {
  return workspaceRequest<Workspace[]>("/api/workspaces");
}

export async function getWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  return workspaceRequest<WorkspaceMember[]>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/members`,
  );
}

export async function createWorkspace(input: { name: string }): Promise<Workspace> {
  return workspaceRequest<Workspace>("/api/workspaces", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function renameWorkspace(workspaceId: string, name: string): Promise<Workspace> {
  return workspaceRequest<Workspace>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}`,
    { method: "PATCH", body: JSON.stringify({ name }) },
  );
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  await workspaceRequest(
    `/api/workspaces/${encodeURIComponent(workspaceId)}`,
    { method: "DELETE" },
  );
}

export async function inviteMember(
  workspaceId: string,
  input: { email: string; role: Exclude<WorkspaceRole, "owner"> },
): Promise<WorkspaceMember> {
  return workspaceRequest<WorkspaceMember>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/members/invite`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export async function removeMember(workspaceId: string, memberId: string): Promise<void> {
  await workspaceRequest(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(memberId)}`,
    { method: "DELETE" },
  );
}

export async function switchWorkspace(workspaceId: string): Promise<void> {
  await workspaceRequest(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/switch`,
    { method: "POST", body: "{}" },
  );
  storeWorkspaceId(workspaceId);
}
