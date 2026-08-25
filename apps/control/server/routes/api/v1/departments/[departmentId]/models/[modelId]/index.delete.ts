import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../../auth/auth";
import { getDepartmentInferenceServices } from "../../../../../../../departments/department-inference-service";
import { errorResponse, jsonResponse, problemResponse } from "../../../../../../../http/responses";

export default defineHandler(async (event) => {
  let auth;
  try { auth = await requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    const services = await getDepartmentInferenceServices(auth, event.context.params?.departmentId ?? "", true);
    const removed = await services.provider.deleteModelDeployment(decodeURIComponent(event.context.params?.modelId ?? ""));
    return removed ? jsonResponse({ message: "Model deployment removed." }) : problemResponse(404, "Model deployment not found.");
  } catch (error) { return errorResponse(error); }
});
