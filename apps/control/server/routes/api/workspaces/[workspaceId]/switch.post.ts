import { defineHandler } from "nitro";
import { unauthorizedResponse } from "../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../http/responses";
import { WorkspaceService } from "../../../../workspaces/workspace-service";

export default defineHandler(async (event) => {
  const service = new WorkspaceService();
  try {
    const { userId } = await service.authenticate(event.req);
    await service.requireRole(
      decodeURIComponent(event.context.params?.workspaceId ?? ""),
      userId,
      ["owner", "admin", "member"],
    );
    return jsonResponse({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes("authentication")) return unauthorizedResponse(error);
    return errorResponse(error);
  }
});
