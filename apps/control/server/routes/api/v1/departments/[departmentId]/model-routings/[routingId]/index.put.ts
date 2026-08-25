import { updateModelRoutingSchema } from "@tali/contracts";
import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../../auth/auth";
import { getDepartmentInferenceServices } from "../../../../../../../departments/department-inference-service";
import { errorResponse, jsonResponse } from "../../../../../../../http/responses";

export default defineHandler(async (event) => {
  let auth;
  try { auth = await requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    const services = await getDepartmentInferenceServices(auth, event.context.params?.departmentId ?? "", true);
    return jsonResponse(await services.modelRoutings.update(
      decodeURIComponent(event.context.params?.routingId ?? ""),
      updateModelRoutingSchema.parse(await event.req.json()),
    ));
  } catch (error) { return errorResponse(error); }
});
