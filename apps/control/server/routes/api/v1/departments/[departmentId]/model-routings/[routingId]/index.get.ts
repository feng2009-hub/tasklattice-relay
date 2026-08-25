import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../../auth/auth";
import { getDepartmentInferenceServices } from "../../../../../../../departments/department-inference-service";
import { errorResponse, jsonResponse, problemResponse } from "../../../../../../../http/responses";

export default defineHandler(async (event) => {
  let auth;
  try { auth = await requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    const services = await getDepartmentInferenceServices(auth, event.context.params?.departmentId ?? "");
    const routing = await services.modelRoutings.get(decodeURIComponent(event.context.params?.routingId ?? ""));
    return routing ? jsonResponse(routing) : problemResponse(404, "Routing not found.");
  } catch (error) { return errorResponse(error); }
});
