import { updateSandboxPolicySchema } from "@tali/contracts";
import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../../http/responses";
import { getRuntimePolicyService, requireProjectRole } from "../../../../../../../services";

export default defineHandler(async (event) => {
  try { await requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    await requireProjectRole(event.req, ["admin"]);
    const policyId = decodeURIComponent(event.context.params?.policyId ?? "");
    const input = updateSandboxPolicySchema.parse(await event.req.json());
    return jsonResponse(await (await getRuntimePolicyService(event.req)).update(policyId, input));
  } catch (error) { return errorResponse(error); }
});
