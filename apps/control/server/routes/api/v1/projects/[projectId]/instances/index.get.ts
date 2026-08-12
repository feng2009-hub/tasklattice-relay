import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../http/responses";
import { getAgentService } from "../../../../../../services";
import { ownerFilterForCapability } from "../../../../../../authorization/authorization-context";
import { agentConfigurationView } from "../../../../../../agents/agent-http-view";

export default defineHandler(async (event) => {
  try {
    requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    return jsonResponse({
      data: (await (await getAgentService(event.req)).list(
        ownerFilterForCapability(event.req, "CAP_AGENT_INSTANCE_CONFIG_VIEW"),
      )).map(agentConfigurationView),
    });
  } catch (error) {
    return errorResponse(error);
  }
});
