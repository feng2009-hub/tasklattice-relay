import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../http/responses";
import { getPolicyService } from "../../../../../services";

export default defineHandler(async (event) => {
  try { requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    const policyId = decodeURIComponent(event.context.params?.policyId ?? "");
    const deleted = (await getPolicyService()).delete(policyId);
    if (!deleted) return jsonResponse({ error: "Policy was not found." }, { status: 404 });
    return jsonResponse({ message: "Policy deleted." });
  } catch (error) { return errorResponse(error); }
});
