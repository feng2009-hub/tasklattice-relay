import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../http/responses";
import { getInferenceGroupService, requireWorkspaceRole } from "../../../../../services";

export default defineHandler(async (event) => {
  try { requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    await requireWorkspaceRole(event.req, ["owner", "admin"]);
    await (await getInferenceGroupService(event.req)).delete(decodeURIComponent(event.context.params?.groupId ?? ""));
    return jsonResponse({ message: "Inference Group deleted." });
  } catch (error) { return errorResponse(error); }
});
