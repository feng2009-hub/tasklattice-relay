import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../../auth/auth";
import { errorResponse, jsonResponse, problemResponse } from "../../../../../../../http/responses";
import { getRuntimePolicyService, requireProjectRole } from "../../../../../../../services";

export default defineHandler(async (event) => {
  try { await requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    await requireProjectRole(event.req, ["admin"]);
    const policyId = decodeURIComponent(event.context.params?.policyId ?? "");
    const deleted = await (await getRuntimePolicyService(event.req)).delete(policyId);
    if (!deleted) return problemResponse(404, "Runtime policy was not found.");
    return jsonResponse({ message: "Runtime policy deleted." });
  } catch (error) { return errorResponse(error); }
});
