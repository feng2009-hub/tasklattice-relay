import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../http/responses";
import { getModelProfileService } from "../../../../../services";

export default defineHandler(async (event) => {
  try { requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    const profile = await (await getModelProfileService(event.req)).get(decodeURIComponent(event.context.params?.profileId ?? ""));
    return profile ? jsonResponse(profile) : jsonResponse({ error: "Model Profile not found." }, { status: 404 });
  } catch (error) { return errorResponse(error); }
});
