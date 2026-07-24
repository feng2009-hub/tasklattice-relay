import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../auth/auth";
import { errorResponse, noContentResponse } from "../../../../../http/responses";
import { getVirtualEmployeeService, requireWorkspaceRole } from "../../../../../services";

export default defineHandler(async (event) => {
  let actor: string;
  try { actor = requireAuth(event.req).sub; } catch (error) { return unauthorizedResponse(error); }
  try {
    await requireWorkspaceRole(event.req, ["owner", "admin"]);
    await (await getVirtualEmployeeService(event.req)).delete(decodeURIComponent(event.context.params?.virtualEmployeeId ?? ""), actor);
    return noContentResponse();
  } catch (error) { return errorResponse(error); }
});
