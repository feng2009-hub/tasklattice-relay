import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../http/responses";
import { getInferenceGroupService } from "../../../../../services";

export default defineHandler(async (event) => {
  try { requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    const group = await (await getInferenceGroupService(event.req)).get(decodeURIComponent(event.context.params?.groupId ?? ""));
    return group ? jsonResponse(group) : jsonResponse({ error: "Inference Group not found." }, { status: 404 });
  } catch (error) { return errorResponse(error); }
});
