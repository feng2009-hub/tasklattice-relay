import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../http/responses";
import { getInferenceGroupService, requireWorkspaceRole } from "../../../../../services";

export default defineHandler(async (event) => {
  try { requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    await requireWorkspaceRole(event.req, ["owner", "admin"]);
    return jsonResponse(await (await getInferenceGroupService(event.req)).validate(
      decodeURIComponent(event.context.params?.groupId ?? ""),
    ));
  }
  catch (error) { return errorResponse(error); }
});
