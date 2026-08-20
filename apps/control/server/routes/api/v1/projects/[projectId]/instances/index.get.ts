import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../http/responses";
import { getInstanceService } from "../../../../../../services";
import { ownerFilterForCapability } from "../../../../../../authorization/authorization-context";
import { instanceConfigurationView } from "../../../../../../instances/instance-http-view";

export default defineHandler(async (event) => {
  try {
    await requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    return jsonResponse({
      data: (await (await getInstanceService(event.req)).list(
        ownerFilterForCapability(event.req, "CAP_AGENT_INSTANCE_CONFIG_VIEW"),
      )).map(instanceConfigurationView),
    });
  } catch (error) {
    return errorResponse(error);
  }
});
