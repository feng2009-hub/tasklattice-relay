import { defineHandler } from "nitro";
import { AccessContextService } from "../../../../auth/access-context-service";
import { requireAuth, unauthorizedResponse } from "../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../http/responses";

export default defineHandler(async (event) => {
  try {
    const auth = await requireAuth(event.req);
    return jsonResponse(await new AccessContextService().get(auth));
  } catch (error) {
    if (error instanceof Error && error.message.includes("authentication")) {
      return unauthorizedResponse(error);
    }
    return errorResponse(error);
  }
});
