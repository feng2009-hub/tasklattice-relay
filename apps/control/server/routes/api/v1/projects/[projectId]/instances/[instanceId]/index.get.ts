import { defineHandler } from "nitro";
import { instanceParamsSchema } from "../../../../../../../api-contracts/schemas";
import { requireAuth, unauthorizedResponse } from "../../../../../../../auth/auth";
import { errorResponse, jsonResponse, problemResponse } from "../../../../../../../http/responses";
import { getInstanceService } from "../../../../../../../services";
import { instanceConfigurationView } from "../../../../../../../instances/instance-http-view";

export default defineHandler(async (event) => {
  try {
    await requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    const { instanceId } = instanceParamsSchema.parse(event.context.params);
    const instance = await (await getInstanceService(event.req)).get(instanceId);
    return instance
      ? jsonResponse(instanceConfigurationView(instance))
      : problemResponse(404, "Instance not found.");
  } catch (error) {
    return errorResponse(error);
  }
});
