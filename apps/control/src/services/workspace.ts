import { getAuthToken } from "@/lib/auth-token";
import { storeWorkspaceId } from "@/lib/workspace-storage";
import type {
  Workspace,
  WorkspaceMember,
  WorkspaceRole,
} from "@/types/workspace";

const WORKSPACES_STORAGE_KEY = "tasklattice.mock.workspaces";
const MEMBERS_STORAGE_KEY = "tasklattice.mock.workspace-members";
const useWorkspaceApi = import.meta.env.VITE_WORKSPACE_API_ENABLED === "true";

const defaultWorkspaces: Workspace[] = [
  {
    id: "individual",
    name: "Individual",
    type: "personal",
    memberCount: 1,
    role: "owner",
  },
  {
    id: "devops",
    name: "DevOps Team",
    type: "team",
    memberCount: 8,
    role: "admin",
  },
  {
    id: "ai-platform",
    name: "AI Platform Team",
    type: "team",
    memberCount: 12,
    role: "member",
  },
];

const defaultMembers: Record<string, WorkspaceMember[]> = {
  individual: [
    {
      id: "local-admin",
      name: "Local Administrator",
      email: "admin@tasklattice.local",
      role: "owner",
      status: "active",
    },
  ],
  devops: [
    {
      id: "local-admin",
      name: "Local Administrator",
      email: "admin@tasklattice.local",
      role: "admin",
      status: "active",
    },
    {
      id: "john-smith",
      name: "John Smith",
      email: "john.smith@example.com",
      role: "member",
      status: "active",
    },
    {
      id: "yi-wang",
      name: "Yi Wang",
      email: "yi.wang@example.com",
      role: "member",
      status: "active",
    },
  ],
  "ai-platform": [
    {
      id: "local-admin",
      name: "Local Administrator",
      email: "admin@tasklattice.local",
      role: "member",
      status: "active",
    },
  ],
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return clone(fallback);
  const stored = window.localStorage.getItem(key);
  if (!stored) {
    window.localStorage.setItem(key, JSON.stringify(fallback));
    return clone(fallback);
  }
  try {
    return JSON.parse(stored) as T;
  } catch {
    window.localStorage.setItem(key, JSON.stringify(fallback));
    return clone(fallback);
  }
}

function writeLocal<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

async function workspaceRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  const payload = (await response.json()) as T | { error?: string; message?: string };
  if (!response.ok) {
    const error = payload as { error?: string; message?: string };
    throw new Error(error.error ?? error.message ?? `Request failed (${response.status}).`);
  }
  return payload as T;
}

function slugify(value: string): string {
  const base = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return base || `workspace-${Date.now()}`;
}

function ensurePersonalWorkspace(workspaces: Workspace[]): Workspace[] {
  if (workspaces.length) return workspaces;
  const personal = clone(defaultWorkspaces[0]!);
  writeLocal(WORKSPACES_STORAGE_KEY, [personal]);
  writeLocal(MEMBERS_STORAGE_KEY, { individual: clone(defaultMembers.individual) });
  return [personal];
}

export async function getWorkspaces(): Promise<Workspace[]> {
  if (useWorkspaceApi) {
    const response = await workspaceRequest<Workspace[] | { data: Workspace[] }>(
      "/api/workspaces",
    );
    const workspaces = Array.isArray(response) ? response : response.data;
    if (workspaces.length) return workspaces;
    return [
      await workspaceRequest<Workspace>("/api/workspaces", {
        method: "POST",
        body: JSON.stringify({ name: "Individual", type: "personal" }),
      }),
    ];
  }
  return ensurePersonalWorkspace(
    readLocal<Workspace[]>(WORKSPACES_STORAGE_KEY, defaultWorkspaces),
  );
}

export async function getWorkspaceMembers(
  workspaceId: string,
): Promise<WorkspaceMember[]> {
  if (useWorkspaceApi) {
    const response = await workspaceRequest<
      WorkspaceMember[] | { data: WorkspaceMember[] }
    >(`/api/workspaces/${encodeURIComponent(workspaceId)}/members`);
    return Array.isArray(response) ? response : response.data;
  }
  const members = readLocal<Record<string, WorkspaceMember[]>>(
    MEMBERS_STORAGE_KEY,
    defaultMembers,
  );
  return clone(members[workspaceId] ?? []);
}

export async function createWorkspace(input: {
  name: string;
}): Promise<Workspace> {
  if (useWorkspaceApi) {
    return workspaceRequest<Workspace>("/api/workspaces", {
      method: "POST",
      body: JSON.stringify({ ...input, type: "team" }),
    });
  }
  const workspaces = await getWorkspaces();
  const existingIds = new Set(workspaces.map((workspace) => workspace.id));
  const baseId = slugify(input.name);
  let id = baseId;
  let suffix = 2;
  while (existingIds.has(id)) id = `${baseId}-${suffix++}`;
  const workspace: Workspace = {
    id,
    name: input.name.trim(),
    type: "team",
    memberCount: 1,
    role: "owner",
  };
  writeLocal(WORKSPACES_STORAGE_KEY, [...workspaces, workspace]);
  const members = readLocal<Record<string, WorkspaceMember[]>>(
    MEMBERS_STORAGE_KEY,
    defaultMembers,
  );
  members[id] = [
    {
      id: "local-admin",
      name: "Local Administrator",
      email: "admin@tasklattice.local",
      role: "owner",
      status: "active",
    },
  ];
  writeLocal(MEMBERS_STORAGE_KEY, members);
  return workspace;
}

export async function renameWorkspace(
  workspaceId: string,
  name: string,
): Promise<Workspace> {
  if (useWorkspaceApi) {
    return workspaceRequest<Workspace>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}`,
      { method: "PATCH", body: JSON.stringify({ name }) },
    );
  }
  const workspaces = await getWorkspaces();
  const workspace = workspaces.find((item) => item.id === workspaceId);
  if (!workspace) throw new Error("Workspace not found.");
  const updated = { ...workspace, name: name.trim() };
  writeLocal(
    WORKSPACES_STORAGE_KEY,
    workspaces.map((item) => (item.id === workspaceId ? updated : item)),
  );
  return updated;
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  if (useWorkspaceApi) {
    await workspaceRequest<void>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}`,
      { method: "DELETE" },
    );
    return;
  }
  const workspaces = await getWorkspaces();
  const workspace = workspaces.find((item) => item.id === workspaceId);
  if (!workspace) throw new Error("Workspace not found.");
  if (workspace.type === "personal") {
    throw new Error("The personal workspace cannot be deleted.");
  }
  const remaining = ensurePersonalWorkspace(
    workspaces.filter((item) => item.id !== workspaceId),
  );
  writeLocal(WORKSPACES_STORAGE_KEY, remaining);
  const members = readLocal<Record<string, WorkspaceMember[]>>(
    MEMBERS_STORAGE_KEY,
    defaultMembers,
  );
  delete members[workspaceId];
  writeLocal(MEMBERS_STORAGE_KEY, members);
}

export async function inviteMember(
  workspaceId: string,
  input: { email: string; role: Exclude<WorkspaceRole, "owner"> },
): Promise<WorkspaceMember> {
  if (useWorkspaceApi) {
    return workspaceRequest<WorkspaceMember>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/members/invite`,
      { method: "POST", body: JSON.stringify(input) },
    );
  }
  const members = readLocal<Record<string, WorkspaceMember[]>>(
    MEMBERS_STORAGE_KEY,
    defaultMembers,
  );
  const workspaceMembers = members[workspaceId] ?? [];
  if (
    workspaceMembers.some(
      (member) => member.email.toLowerCase() === input.email.toLowerCase(),
    )
  ) {
    throw new Error("This email is already a member or has a pending invitation.");
  }
  const member: WorkspaceMember = {
    id: `invite-${Date.now()}`,
    name: input.email.split("@")[0] || input.email,
    email: input.email,
    role: input.role,
    status: "invited",
  };
  members[workspaceId] = [...workspaceMembers, member];
  writeLocal(MEMBERS_STORAGE_KEY, members);
  const workspaces = await getWorkspaces();
  writeLocal(
    WORKSPACES_STORAGE_KEY,
    workspaces.map((workspace) =>
      workspace.id === workspaceId
        ? { ...workspace, memberCount: workspace.memberCount + 1 }
        : workspace,
    ),
  );
  return member;
}

export async function removeMember(
  workspaceId: string,
  memberId: string,
): Promise<void> {
  if (useWorkspaceApi) {
    await workspaceRequest<void>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(memberId)}`,
      { method: "DELETE" },
    );
    return;
  }
  const members = readLocal<Record<string, WorkspaceMember[]>>(
    MEMBERS_STORAGE_KEY,
    defaultMembers,
  );
  const before = members[workspaceId] ?? [];
  members[workspaceId] = before.filter((member) => member.id !== memberId);
  writeLocal(MEMBERS_STORAGE_KEY, members);
  if (members[workspaceId].length !== before.length) {
    const workspaces = await getWorkspaces();
    writeLocal(
      WORKSPACES_STORAGE_KEY,
      workspaces.map((workspace) =>
        workspace.id === workspaceId
          ? { ...workspace, memberCount: Math.max(1, workspace.memberCount - 1) }
          : workspace,
      ),
    );
  }
}

export async function switchWorkspace(workspaceId: string): Promise<void> {
  if (useWorkspaceApi) {
    await workspaceRequest<void>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/switch`,
      { method: "POST", body: "{}" },
    );
  }
  storeWorkspaceId(workspaceId);
}
