import type { PlatformPrincipal } from "../auth/auth";
import { ModelRoutingService } from "../model-routings/model-routing-service";
import { LiteLLMClient } from "../providers/litellm-client";
import { ProviderService } from "../providers/provider-service";
import { requireDepartmentAdministrator } from "./department-access";
import { DepartmentInferenceStore } from "./department-inference-store";
import { DepartmentResourceAssignmentService } from "./department-resource-assignment-service";

const litellm = new LiteLLMClient();

export async function getDepartmentInferenceServices(
  auth: PlatformPrincipal,
  departmentId: string,
  write = false,
) {
  await requireDepartmentAdministrator(auth, departmentId, undefined, {
    capability: write ? "CAP_DEPARTMENT_SETTINGS_UPDATE" : "CAP_DEPARTMENT_VIEW",
    requireActiveDepartment: true,
  });
  const store = new DepartmentInferenceStore(departmentId);
  return {
    assignments: new DepartmentResourceAssignmentService(departmentId),
    store,
    provider: new ProviderService(store, litellm),
    modelRoutings: new ModelRoutingService(store, litellm),
  };
}
