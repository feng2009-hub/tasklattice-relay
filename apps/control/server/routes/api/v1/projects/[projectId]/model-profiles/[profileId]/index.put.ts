import { updateModelProfileSchema } from "@tasklattice/contracts";
import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../../http/responses";
import { getModelProfileService, requireProjectRole } from "../../../../../../../services";

export default defineHandler(async (event) => {
  try { requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    await requireProjectRole(event.req, ["admin"]);
    const id = decodeURIComponent(event.context.params?.profileId ?? "");
    return jsonResponse(await (await getModelProfileService(event.req)).update(id, updateModelProfileSchema.parse(await event.req.json())));
  } catch (error) { return errorResponse(error); }
});
