import { createSandboxPolicySchema } from "@tasklattice/contracts";
import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../http/responses";
import { getPolicyService } from "../../../../services";

export default defineHandler(async (event) => {
  try { requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    const input = createSandboxPolicySchema.parse(await event.req.json());
    const policy = (await getPolicyService()).create(input);
    return jsonResponse(policy, {
      status: 201,
      headers: { location: `/api/v1/policies/${policy.id}` },
    });
  } catch (error) { return errorResponse(error); }
});
