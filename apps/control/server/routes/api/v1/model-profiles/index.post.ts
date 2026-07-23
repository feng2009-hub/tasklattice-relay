import { createModelProfileSchema } from "@tasklattice/contracts";
import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../http/responses";
import { getModelProfileService, requireWorkspaceRole } from "../../../../services";

export default defineHandler(async (event) => {
  try { requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    await requireWorkspaceRole(event.req, ["owner", "admin"]);
    const profile = await (await getModelProfileService(event.req)).create(createModelProfileSchema.parse(await event.req.json()));
    return jsonResponse(profile, { status: 201, headers: { location: `/api/v1/model-profiles/${profile.id}` } });
  } catch (error) { return errorResponse(error); }
});
