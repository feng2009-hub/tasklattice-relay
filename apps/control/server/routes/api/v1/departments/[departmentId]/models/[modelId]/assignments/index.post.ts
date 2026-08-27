import { assignDepartmentInferenceResourceSchema } from "@tali/contracts";
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
    const result = await services.assignments.assign(
      "MODEL",
      decodeURIComponent(event.context.params?.modelId ?? ""),
      assignDepartmentInferenceResourceSchema.parse(await event.req.json()),
      auth.user.id,
    );
    return jsonResponse(result);
  } catch (error) { return errorResponse(error); }
});
