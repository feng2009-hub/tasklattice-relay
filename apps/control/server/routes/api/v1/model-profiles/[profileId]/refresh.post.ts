import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../http/responses";
import { getModelProfileService, requireWorkspaceRole } from "../../../../../services";

export default defineHandler(async (event) => {
  try { requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    await requireWorkspaceRole(event.req, ["owner", "admin"]);
    return jsonResponse(await (await getModelProfileService(event.req)).refresh(
      decodeURIComponent(event.context.params?.profileId ?? ""),
    ));
  }
  catch (error) { return errorResponse(error); }
});
