import { z } from "zod";
import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../http/responses";
import { getAgentService, requireWorkspaceRole } from "../../../../../services";

export default defineHandler(async (event) => {
  let actor: string;
  try { actor = requireAuth(event.req).sub; } catch (error) { return unauthorizedResponse(error); }
  try {
    await requireWorkspaceRole(event.req, ["owner", "admin"]);
    const input = z.object({ virtualEmployeeId: z.string().uuid() }).parse(await event.req.json());
    return jsonResponse(await (await getAgentService(event.req)).bindVirtualEmployee(
      decodeURIComponent(event.context.params?.agentId ?? ""),
      input.virtualEmployeeId,
      actor,
    ));
  } catch (error) { return errorResponse(error); }
});
