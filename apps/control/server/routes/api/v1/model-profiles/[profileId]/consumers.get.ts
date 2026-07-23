import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../http/responses";
import { getModelProfileService } from "../../../../../services";

export default defineHandler(async (event) => {
  try { requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    const consumers = await (await getModelProfileService(event.req)).consumers(decodeURIComponent(event.context.params?.profileId ?? ""));
    return jsonResponse({ data: consumers.map(({ liteLLMTokenId: _secretIdentifier, ...consumer }) => consumer) });
  }
  catch (error) { return errorResponse(error); }
});
