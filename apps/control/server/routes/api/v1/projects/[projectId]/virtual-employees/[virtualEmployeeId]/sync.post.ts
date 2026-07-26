import { z } from "zod";
import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../../http/responses";
import { getVirtualEmployeeService, requireProjectRole } from "../../../../../../../services";

export default defineHandler(async (event) => {
  let actor: string;
  try { actor = requireAuth(event.req).sub; } catch (error) { return unauthorizedResponse(error); }
  try {
    await requireProjectRole(event.req, ["admin"]);
    const input = z.object({ apply: z.boolean().default(false) }).parse(await event.req.json());
    return jsonResponse(await (await getVirtualEmployeeService(event.req)).sync(decodeURIComponent(event.context.params?.virtualEmployeeId ?? ""), actor, input.apply));
  } catch (error) { return errorResponse(error); }
});
