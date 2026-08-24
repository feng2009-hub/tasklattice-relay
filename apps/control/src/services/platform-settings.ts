import type {
  BuiltinRoleCatalogView,
  CreatePlatformDepartmentInput,
  ExternalRoleBindingView,
  PlatformOrganizationView,
  PlatformPeopleQuery,
  PlatformPeopleView,
  PlatformEmailSettingsView,
  PlatformEmailValidationView,
  PlatformSecuritySettingsView,
  PlatformSettingsView,
  PlatformSsoValidationView,
  ReplaceExternalRoleBindingsInput,
  UpdatePlatformSecuritySettingsInput,
  UpdatePlatformEmailSettingsInput,
  UpdatePlatformSettingsInput,
  ValidatePlatformEmailSettingsInput,
  ValidatePlatformSsoSettingsInput,
} from "@tali/contracts";
import type { Project, ProjectRole } from "@/types/project";

async function platformRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  });
  const text = await response.text();
  const payload = text
    ? (JSON.parse(text) as T | { detail?: string })
    : undefined;
  if (!response.ok) {
    throw new Error(
      (payload as { detail?: string } | undefined)?.detail
      ?? `Request failed (${response.status}).`,
    );
  }
  return payload as T;
}

export const platformSettingsQueryKey = ["platform-settings"] as const;
export const platformOrganizationQueryKey = ["platform-organization"] as const;
export const platformPeopleQueryKey = ["platform-people"] as const;
export const platformRoleCatalogQueryKey = ["platform-role-catalog"] as const;

export function getPlatformSettings(): Promise<PlatformSettingsView> {
  return platformRequest("/api/v1/platform/settings");
}

export function updatePlatformSettings(
  input: UpdatePlatformSettingsInput,
): Promise<PlatformSettingsView> {
  return platformRequest("/api/v1/platform/settings", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function updatePlatformSecuritySettings(
  input: UpdatePlatformSecuritySettingsInput,
): Promise<PlatformSecuritySettingsView> {
  return platformRequest("/api/v1/platform/security", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function updatePlatformEmailSettings(
  input: UpdatePlatformEmailSettingsInput,
): Promise<PlatformEmailSettingsView> {
  return platformRequest("/api/v1/platform/email", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function validatePlatformEmailSettings(
  input: ValidatePlatformEmailSettingsInput,
): Promise<PlatformEmailValidationView> {
  return platformRequest("/api/v1/platform/email/validate", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function validatePlatformSsoSettings(
  input: ValidatePlatformSsoSettingsInput,
): Promise<PlatformSsoValidationView> {
  return platformRequest("/api/v1/platform/security/validate", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function replaceExternalRoleBindings(
  input: ReplaceExternalRoleBindingsInput,
): Promise<ExternalRoleBindingView[]> {
  return platformRequest("/api/v1/platform/security/role-bindings", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function getPlatformOrganization(): Promise<PlatformOrganizationView> {
  return platformRequest("/api/v1/platform/organization");
}

export function getPlatformPeople(
  query: PlatformPeopleQuery,
): Promise<PlatformPeopleView> {
  const search = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  if (query.search) search.set("search", query.search);
  if (query.departmentId) search.set("departmentId", query.departmentId);
  if (query.projectId) search.set("projectId", query.projectId);
  return platformRequest(`/api/v1/platform/people?${search.toString()}`);
}

export function getPlatformRoleCatalog(): Promise<BuiltinRoleCatalogView> {
  return platformRequest("/api/v1/platform/roles");
}

export function createPlatformDepartment(
  input: CreatePlatformDepartmentInput,
): Promise<PlatformOrganizationView["departments"][number]> {
  return platformRequest("/api/v1/platform/departments", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function createPlatformProject(input: {
  departmentId: string;
  invitations: Array<{ email: string; role: ProjectRole }>;
  name: string;
}): Promise<Project> {
  return platformRequest("/api/v1/platform/projects", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
