import { z } from "zod";
import { defineHandler } from "nitro";
import { unauthorizedResponse } from "../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../http/responses";
import { WorkspaceService } from "../../../../workspaces/workspace-service";

const inputSchema = z.object({ name: z.string().trim().min(2).max(80) });

export default defineHandler(async (event) => {
  const service = new WorkspaceService();
  try {
    const { userId } = await service.authenticate(event.req);
    const workspaceId = decodeURIComponent(event.context.params?.workspaceId ?? "");
    const input = inputSchema.parse(await event.req.json());
    return jsonResponse(await service.rename(workspaceId, userId, input.name));
  } catch (error) {
    if (error instanceof Error && error.message.includes("authentication")) return unauthorizedResponse(error);
    return errorResponse(error);
  }
});
