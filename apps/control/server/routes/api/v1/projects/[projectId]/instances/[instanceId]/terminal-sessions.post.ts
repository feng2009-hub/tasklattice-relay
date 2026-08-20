import { createTerminalSessionInputSchema } from "@tali/contracts";
import { defineHandler } from "nitro";
import { instanceParamsSchema } from "../../../../../../../api-contracts/schemas";
import { requireAuth, unauthorizedResponse } from "../../../../../../../auth/auth";
import { errorResponse, jsonResponse, problemResponse } from "../../../../../../../http/responses";
import { getInstanceService } from "../../../../../../../services";
import { createTerminalSession } from "../../../../../../../terminal/terminal-sessions";
import { primaryTerminalTargetId } from "../../../../../../../terminal/terminal-targets";
import { runtimeStatusFromHealth } from "../../../../../../../runtime/runtime-status";

export default defineHandler(async (event) => {
  try {
    await requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    const { instanceId: id } = instanceParamsSchema.parse(event.context.params);
    const input = createTerminalSessionInputSchema.parse(await event.req.json());
    const service = await getInstanceService(event.req);
    const instance = await service.get(id);
    if (!instance) return problemResponse(404, "Instance not found.");
    if (instance.status !== "READY") {
      return problemResponse(409, "Terminal is available only when the NemoClaw sandbox is ready.");
    }
    const runtime = runtimeStatusFromHealth(await service.runner.getHealth());
    if (!runtime.terminal.available)
      return problemResponse(
        409,
        runtime.terminal.reason ?? "The active runtime cannot launch the NemoClaw TUI.",
      );
    if (input.targetId !== primaryTerminalTargetId) {
      return problemResponse(409, "The requested terminal target is not available.");
    }
    return jsonResponse(
      createTerminalSession(
        service.store.projectId,
        id,
        instance.sandboxName,
        instance.agentPlatform,
        input.targetId,
      ),
      {
        status: 201,
      },
    );
  } catch (error) {
    return errorResponse(error);
  }
});
