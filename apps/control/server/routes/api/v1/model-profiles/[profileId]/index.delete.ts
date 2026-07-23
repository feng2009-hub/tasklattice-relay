import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../http/responses";
import { getModelProfileService, requireWorkspaceRole } from "../../../../../services";

export default defineHandler(async (event) => {
  try { requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    await requireWorkspaceRole(event.req, ["owner", "admin"]);
    await (await getModelProfileService(event.req)).delete(decodeURIComponent(event.context.params?.profileId ?? ""));
    return jsonResponse({ message: "Model Profile deleted." });
  } catch (error) { return errorResponse(error); }
});
