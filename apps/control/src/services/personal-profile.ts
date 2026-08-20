export interface PersonalProfile {
  displayName: string;
  email: string;
  language: AccountLanguage;
  hasPassword: boolean;
  systemRole: "user" | "super_administrator";
  theme: ThemePreference;
  timezone: string;
  username: string;
}

export type AccountLanguage = "en-US" | "zh-CN";
export type ThemePreference = "system" | "light" | "dark";

export const personalProfileQueryKey = ["personal-profile"] as const;

async function profileRequest<T = PersonalProfile>(
  path = "/api/v1/profile",
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
  const payload = (text ? JSON.parse(text) : undefined) as T & { detail?: string };
  if (!response.ok) {
    throw new Error(
      payload.detail ?? `Request failed (${response.status}).`,
    );
  }
  return payload as T;
}

export function getPersonalProfile(): Promise<PersonalProfile> {
  return profileRequest();
}

export function updatePersonalProfile(input: {
  language: AccountLanguage;
  theme: ThemePreference;
  timezone: string;
}): Promise<PersonalProfile> {
  return profileRequest("/api/v1/profile", {
    body: JSON.stringify(input),
    method: "PATCH",
  });
}

export async function resetLocalPassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  await profileRequest<void>("/api/v1/profile/password", {
    body: JSON.stringify(input),
    method: "POST",
  });
}
