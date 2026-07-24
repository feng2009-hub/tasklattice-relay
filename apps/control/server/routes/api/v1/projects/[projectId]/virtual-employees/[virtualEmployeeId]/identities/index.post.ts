import { identityBindingInputSchema } from "@tasklattice/contracts";
import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../../../http/responses";
import { getVirtualEmployeeService, requireProjectRole } from "../../../../../../../../services";

export default defineHandler(async (event) => {
  let actor: string;
  try { actor = requireAuth(event.req).sub; } catch (error) { return unauthorizedResponse(error); }
  try {
    await requireProjectRole(event.req, ["admin"]);
    const service = await getVirtualEmployeeService(event.req);
    return jsonResponse(await service.attachIdentity(decodeURIComponent(event.context.params?.virtualEmployeeId ?? ""), identityBindingInputSchema.parse(await event.req.json()), actor), { status: 201 });
  } catch (error) { return errorResponse(error); }
});
