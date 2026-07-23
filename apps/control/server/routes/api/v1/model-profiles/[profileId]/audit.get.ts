import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../http/responses";
import { getModelProfileService } from "../../../../../services";

export default defineHandler(async (event) => {
  try { requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try { return jsonResponse({ data: await (await getModelProfileService(event.req)).auditEvents(decodeURIComponent(event.context.params?.profileId ?? "")) }); }
  catch (error) { return errorResponse(error); }
});
