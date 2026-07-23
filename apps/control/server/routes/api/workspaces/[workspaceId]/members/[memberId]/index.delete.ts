import { defineHandler } from "nitro";
import { unauthorizedResponse } from "../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../http/responses";
import { WorkspaceService } from "../../../../../../workspaces/workspace-service";

export default defineHandler(async (event) => {
  const service = new WorkspaceService();
  try {
    const { userId } = await service.authenticate(event.req);
    await service.removeMember(
      decodeURIComponent(event.context.params?.workspaceId ?? ""),
      userId,
      decodeURIComponent(event.context.params?.memberId ?? ""),
    );
    return jsonResponse({ message: "Workspace member removed." });
  } catch (error) {
    if (error instanceof Error && error.message.includes("authentication")) return unauthorizedResponse(error);
    return errorResponse(error);
  }
});
