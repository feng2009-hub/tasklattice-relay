import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../http/responses";
import { getProjectStore } from "../../../../../../services";

export default defineHandler(async (event) => {
  try { await requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    const availability = await (await getProjectStore(event.req)).departmentInferenceAvailability();
    return jsonResponse({
      departmentId: availability.departmentId,
      departmentName: availability.departmentName,
      models: availability.models,
    });
  } catch (error) { return errorResponse(error); }
});
