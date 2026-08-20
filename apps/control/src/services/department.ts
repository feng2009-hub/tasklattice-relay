import type {
  DepartmentDetail,
  DepartmentSummary,
  UpdateDepartmentInput,
} from "@/types/department";

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
