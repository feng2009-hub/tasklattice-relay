import { defineHandler } from "nitro";
import { instanceParamsSchema } from "../../../../../../../api-contracts/schemas";
import { requireAuth, unauthorizedResponse } from "../../../../../../../auth/auth";
import { instanceRuntimeLogView } from "../../../../../../../instances/instance-http-view";
import { errorResponse, jsonResponse, problemResponse } from "../../../../../../../http/responses";
import { getInstanceService } from "../../../../../../../services";

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
      ? jsonResponse(instanceRuntimeLogView(instance), {
          headers: { "cache-control": "no-store" },
        })
      : problemResponse(404, "Instance not found.");
  } catch (error) {
    return errorResponse(error);
  }
});
