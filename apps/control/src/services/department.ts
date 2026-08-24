import type {
  DepartmentDetail,
  DepartmentSummary,
  UpdateDepartmentInput,
} from "@/types/department";
import type {
  DepartmentSettingsView,
  UpdateDepartmentSettingsInput,
} from "@tali/contracts";

async function departmentRequest<T>(
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
    const problem = payload as { detail?: string } | undefined;
    throw new Error(
      problem?.detail ?? `Request failed (${response.status}).`,
    );
  }
  return payload as T;
}

export const departmentQueryKey = (departmentId: string) =>
  ["department", departmentId] as const;

export const departmentSettingsQueryKey = (departmentId: string) =>
  ["department-settings", departmentId] as const;

export async function getDepartments(): Promise<DepartmentSummary[]> {
  return departmentRequest<DepartmentSummary[]>("/api/v1/departments");
}

export async function getDepartment(
  departmentId: string,
): Promise<DepartmentDetail> {
  return departmentRequest<DepartmentDetail>(
    `/api/v1/departments/${encodeURIComponent(departmentId)}`,
  );
}

export async function updateDepartment(
  departmentId: string,
  input: UpdateDepartmentInput,
): Promise<DepartmentDetail> {
  return departmentRequest<DepartmentDetail>(
    `/api/v1/departments/${encodeURIComponent(departmentId)}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export async function getDepartmentSettings(
  departmentId: string,
): Promise<DepartmentSettingsView> {
  return departmentRequest<DepartmentSettingsView>(
    `/api/v1/departments/${encodeURIComponent(departmentId)}/settings`,
  );
}

export async function updateDepartmentSettings(
  departmentId: string,
  input: UpdateDepartmentSettingsInput,
): Promise<DepartmentSettingsView> {
  return departmentRequest<DepartmentSettingsView>(
    `/api/v1/departments/${encodeURIComponent(departmentId)}/settings`,
    { method: "PUT", body: JSON.stringify(input) },
  );
}
