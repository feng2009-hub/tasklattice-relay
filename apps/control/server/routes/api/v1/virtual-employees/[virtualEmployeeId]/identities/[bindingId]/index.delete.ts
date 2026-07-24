import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../../http/responses";
import { getVirtualEmployeeService, requireWorkspaceRole } from "../../../../../../../services";

export default defineHandler(async (event) => {
  let actor: string;
  try { actor = requireAuth(event.req).sub; } catch (error) { return unauthorizedResponse(error); }
  try {
    await requireWorkspaceRole(event.req, ["owner", "admin"]);
    return jsonResponse(await (await getVirtualEmployeeService(event.req)).detachIdentity(
      decodeURIComponent(event.context.params?.virtualEmployeeId ?? ""),
      decodeURIComponent(event.context.params?.bindingId ?? ""),
      actor,
    ));
  } catch (error) { return errorResponse(error); }
});
