import { updateInstanceAccessPoliciesSchema } from "@tali/contracts";
import { defineHandler } from "nitro";
import {
  requireAuth,
  unauthorizedResponse,
} from "../../../../../../../auth/auth";
import {
  errorResponse,
  jsonResponse,
} from "../../../../../../../http/responses";
import {
  getInstanceService,
  requireProjectRole,
} from "../../../../../../../services";

export default defineHandler(async (event) => {
  let auth;
  try {
    auth = await requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    await requireProjectRole(event.req, ["admin"]);
    const input = updateInstanceAccessPoliciesSchema.parse(
      await event.req.json(),
    );
    return jsonResponse(
      await (
        await getInstanceService(event.req)
      ).updateAccessPolicies(
        decodeURIComponent(event.context.params?.instanceId ?? ""),
        input.accessPolicyIds,
        auth.user.displayName || auth.user.username,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
});
