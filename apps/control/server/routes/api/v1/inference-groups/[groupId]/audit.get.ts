import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../http/responses";
import { getInferenceGroupService } from "../../../../../services";

export default defineHandler(async (event) => {
  try { requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try { return jsonResponse({ data: (await getInferenceGroupService()).auditEvents(decodeURIComponent(event.context.params?.groupId ?? "")) }); }
  catch (error) { return errorResponse(error); }
});
