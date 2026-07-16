import { defineHandler } from "nitro";
import { z } from "zod";
import { requireAuth, unauthorizedResponse } from "../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../http/responses";
import { getAgentService } from "../../../../../services";
import { createTerminalSession } from "../../../../../terminal/terminal-sessions";
import { runtimeStatusFromHealth } from "../../../../../runtime/runtime-status";

export default defineHandler(async (event) => {
  try {
    requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    const id = z.string().uuid().parse(event.context.params?.agentId);
    const service = await getAgentService();
    const agent = await service.get(id);
    if (!agent)
      return jsonResponse({ error: "Agent not found." }, { status: 404 });
    if (agent.status !== "READY")
      return jsonResponse(
        {
          error:
            "Terminal is available only when the NemoClaw sandbox is ready.",
        },
        { status: 409 },
      );
    const runtime = runtimeStatusFromHealth(await service.runner.getHealth());
    if (!runtime.terminal.available)
      return jsonResponse(
        {
          error:
            runtime.terminal.reason ??
            "The active runtime cannot launch the NemoClaw TUI.",
        },
        { status: 409 },
      );
    return jsonResponse(
      createTerminalSession(id, agent.sandboxName, agent.agentPlatform),
      {
        status: 201,
      },
    );
  } catch (error) {
    return errorResponse(error);
  }
});
