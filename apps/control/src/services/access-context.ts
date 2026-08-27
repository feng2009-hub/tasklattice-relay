import type {
  BuiltinProjectRoleId,
  BuiltinRoleId,
  ProjectMembershipRole,
} from "@tali/contracts";

export type AccessContextLevel = "platform" | "department" | "project";

export interface AccessContextOption {
  description: string;
  id: string;
  level: AccessContextLevel;
  resourceId: string | null;
  resourceName: string;
  roleId: BuiltinRoleId;
  roleLabel: string;
  target: string;
}

export interface AccessContextState {
  active: AccessContextOption | null;
  options: AccessContextOption[];
}

export type SelectAccessContextInput = Pick<
  AccessContextOption,
  "level" | "resourceId" | "roleId"
>;

export const projectRoleToBuiltinRole = {
  admin: "ROLE_PROJECT_ADMIN",
  auditor: "ROLE_AUDITOR",
  developer: "ROLE_AGENT_DEVELOPER",
  reviewer: "ROLE_REVIEWER",
  user: "ROLE_USER",
} as const satisfies Record<ProjectMembershipRole, BuiltinProjectRoleId>;

async function accessContextRequest(
  init?: RequestInit,
): Promise<AccessContextState> {
  const response = await fetch("/api/v1/access-context", {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  });
  const payload = await response.json() as AccessContextState & {
    detail?: string;
  };
  if (!response.ok) {
    throw new Error(payload.detail ?? `Request failed (${response.status}).`);
  }
  return payload;
}

export function getAccessContext(): Promise<AccessContextState> {
  return accessContextRequest();
}

export function selectAccessContext(
  input: SelectAccessContextInput,
): Promise<AccessContextState> {
  return accessContextRequest({
    method: "PUT",
    body: JSON.stringify(input),
  });
}
