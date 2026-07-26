import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../../http/responses";
import { getVirtualEmployeeService, requireProjectRole } from "../../../../../../../services";

export default defineHandler(async (event) => {
  let actor: string;
  try { actor = requireAuth(event.req).sub; } catch (error) { return unauthorizedResponse(error); }
  try {
    await requireProjectRole(event.req, ["admin"]);
    return jsonResponse(await (await getVirtualEmployeeService(event.req)).rotate(decodeURIComponent(event.context.params?.virtualEmployeeId ?? ""), actor));
  } catch (error) { return errorResponse(error); }
});
