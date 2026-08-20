import { defineHandler } from "nitro";
import { instanceParamsSchema } from "../../../../../../../api-contracts/schemas";
import { requireAuth, unauthorizedResponse } from "../../../../../../../auth/auth";
import { errorResponse, jsonResponse, problemResponse } from "../../../../../../../http/responses";
import { runtimeStatusFromHealth } from "../../../../../../../runtime/runtime-status";
import { getInstanceService } from "../../../../../../../services";
import { terminalTargetsForAgent } from "../../../../../../../terminal/terminal-targets";

export default defineHandler(async (event) => {
  try {
    await requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    const { instanceId: id } = instanceParamsSchema.parse(event.context.params);
    const service = await getInstanceService(event.req);
    const instance = await service.get(id);
    if (!instance) return problemResponse(404, "Instance not found.");
    const capability = runtimeStatusFromHealth(
      await service.runner.getHealth(),
    ).terminal;
    return jsonResponse({ data: terminalTargetsForAgent(instance, capability) });
  } catch (error) {
    return errorResponse(error);
  }
});
