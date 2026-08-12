import { defineHandler } from "nitro";
import {
  requireAuth,
  unauthorizedResponse,
} from "../../../../../../auth/auth";
import {
  errorResponse,
  jsonResponse,
} from "../../../../../../http/responses";
import { getAgentGardenService } from "../../../../../../services";
import { ownerFilterForCapability } from "../../../../../../authorization/authorization-context";

export default defineHandler(async (event) => {
  try {
    requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    return jsonResponse(
      await (await getAgentGardenService(event.req)).snapshot(
        ownerFilterForCapability(event.req, "CAP_AGENT_REGISTRATION_VIEW"),
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
});
