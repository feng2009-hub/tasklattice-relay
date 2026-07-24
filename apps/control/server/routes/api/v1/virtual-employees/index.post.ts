import { createVirtualEmployeeSchema } from "@tasklattice/contracts";
import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../http/responses";
import { getVirtualEmployeeService, requireWorkspaceRole } from "../../../../services";

export default defineHandler(async (event) => {
  let actor: string;
  try { actor = requireAuth(event.req).sub; } catch (error) { return unauthorizedResponse(error); }
  try {
    await requireWorkspaceRole(event.req, ["owner", "admin"]);
    const input = createVirtualEmployeeSchema.parse(await event.req.json());
    return jsonResponse(await (await getVirtualEmployeeService(event.req)).create(input, actor), { status: 201 });
  } catch (error) { return errorResponse(error); }
});
