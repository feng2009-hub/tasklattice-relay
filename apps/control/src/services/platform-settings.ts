import type {
  PlatformOrganizationView,
  PlatformSettingsView,
  UpdatePlatformSettingsInput,
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

export function getPlatformOrganization(): Promise<PlatformOrganizationView> {
  return platformRequest("/api/v1/platform/organization");
}

export function createPlatformProject(input: {
  confirmImmutableName: true;
  departmentId: string;
  invitations: Array<{ email: string; role: ProjectRole }>;
  name: string;
}): Promise<Project> {
  return platformRequest("/api/v1/platform/projects", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
