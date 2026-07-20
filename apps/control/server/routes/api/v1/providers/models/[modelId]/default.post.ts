import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../http/responses";
import { getProviderService } from "../../../../../../services";

export default defineHandler(async (event) => {
  try {
    requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    const modelId = event.context.params?.modelId;
    if (!modelId)
      return jsonResponse({ error: "Model deployment id is required." }, { status: 400 });
    const deployment = (await getProviderService()).markModelAsDefault(modelId);
    if (!deployment)
      return jsonResponse({ error: "Model deployment not found." }, { status: 404 });
    return jsonResponse(deployment);
  } catch (error) {
    return errorResponse(error);
  }
});
