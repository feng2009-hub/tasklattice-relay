import { createInferenceGroupSchema } from "@tasklattice/contracts";
import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../http/responses";
import { getInferenceGroupService, requireWorkspaceRole } from "../../../../services";

export default defineHandler(async (event) => {
  try { requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    await requireWorkspaceRole(event.req, ["owner", "admin"]);
    const group = await (await getInferenceGroupService(event.req)).create(createInferenceGroupSchema.parse(await event.req.json()));
    return jsonResponse(group, { status: 201, headers: { location: `/api/v1/inference-groups/${group.id}` } });
  } catch (error) { return errorResponse(error); }
});
