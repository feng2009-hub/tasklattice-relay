import { createModelRoutingSchema } from "@tali/contracts";
import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../auth/auth";
import { getDepartmentInferenceServices } from "../../../../../../departments/department-inference-service";
import { errorResponse, jsonResponse } from "../../../../../../http/responses";

export default defineHandler(async (event) => {
  let auth;
  try { auth = await requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    const departmentId = event.context.params?.departmentId ?? "";
    const services = await getDepartmentInferenceServices(auth, departmentId, true);
    const routing = await services.modelRoutings.create(createModelRoutingSchema.parse(await event.req.json()));
    return jsonResponse(routing, { status: 201, headers: { location: `/api/v1/departments/${encodeURIComponent(departmentId)}/model-routings/${routing.id}` } });
  } catch (error) { return errorResponse(error); }
});
