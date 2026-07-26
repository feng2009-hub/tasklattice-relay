import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../../../http/responses";
import { getVirtualEmployeeService } from "../../../../../../../../services";

export default defineHandler(async (event) => {
  try { requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    const value = await (await getVirtualEmployeeService(event.req)).get(decodeURIComponent(event.context.params?.virtualEmployeeId ?? ""));
    return jsonResponse({ data: value.accessScopes });
  } catch (error) { return errorResponse(error); }
});
