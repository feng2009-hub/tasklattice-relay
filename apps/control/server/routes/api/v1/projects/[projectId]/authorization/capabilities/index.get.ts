import { projectCapabilityCatalog } from "@tali/contracts";
import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../../http/responses";

export default defineHandler(async (event) => {
  try {
    requireAuth(event.req);
    return jsonResponse({ data: projectCapabilityCatalog });
  } catch (error) {
    if (error instanceof Error && /authentication/i.test(error.message)) {
      return unauthorizedResponse(error);
    }
    return errorResponse(error);
  }
});
