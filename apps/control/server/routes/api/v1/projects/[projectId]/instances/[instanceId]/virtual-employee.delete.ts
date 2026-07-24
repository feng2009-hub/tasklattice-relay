import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../../http/responses";
import { getAgentService, requireProjectRole } from "../../../../../../../services";

export default defineHandler(async (event) => {
  let actor: string;
  try { actor = requireAuth(event.req).sub; } catch (error) { return unauthorizedResponse(error); }
  try {
    await requireProjectRole(event.req, ["admin"]);
    return jsonResponse(await (await getAgentService(event.req)).unbindVirtualEmployee(
      decodeURIComponent(event.context.params?.instanceId ?? ""),
      actor,
    ));
  } catch (error) { return errorResponse(error); }
});
