import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../../http/responses";
import { builtinProjectRoles } from "../../../../../../../authorization/builtin-roles";

export default defineHandler(async (event) => {
  try {
    requireAuth(event.req);
    return jsonResponse({ data: builtinProjectRoles });
  } catch (error) {
    if (error instanceof Error && /authentication/i.test(error.message)) {
      return unauthorizedResponse(error);
    }
    return errorResponse(error);
  }
});
