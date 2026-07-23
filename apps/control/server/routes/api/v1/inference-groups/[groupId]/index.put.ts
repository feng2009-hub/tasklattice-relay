import { updateInferenceGroupSchema } from "@tasklattice/contracts";
import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../http/responses";
import { getInferenceGroupService, requireWorkspaceRole } from "../../../../../services";

export default defineHandler(async (event) => {
  try { requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    await requireWorkspaceRole(event.req, ["owner", "admin"]);
    const id = decodeURIComponent(event.context.params?.groupId ?? "");
    return jsonResponse((await getInferenceGroupService(event.req)).update(id, updateInferenceGroupSchema.parse(await event.req.json())));
  } catch (error) { return errorResponse(error); }
});
