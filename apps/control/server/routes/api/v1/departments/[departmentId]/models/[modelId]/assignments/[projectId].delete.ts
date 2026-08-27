import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../../../auth/auth";
import { getDepartmentInferenceServices } from "../../../../../../../../departments/department-inference-service";
import { errorResponse, jsonResponse } from "../../../../../../../../http/responses";

export default defineHandler(async (event) => {
  let auth;
  try { auth = await requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    const services = await getDepartmentInferenceServices(
      auth,
      event.context.params?.departmentId ?? "",
      true,
    );
    await services.assignments.unassign(
      "MODEL",
      decodeURIComponent(event.context.params?.modelId ?? ""),
      decodeURIComponent(event.context.params?.projectId ?? ""),
    );
    return jsonResponse({ message: "Department Model assignment removed." });
  } catch (error) { return errorResponse(error); }
});
