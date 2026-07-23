import { z } from "zod";
import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../http/responses";
import { WorkspaceService } from "../../../workspaces/workspace-service";

const inputSchema = z.object({ name: z.string().trim().min(2).max(80) });

export default defineHandler(async (event) => {
  try { requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    const service = new WorkspaceService();
    const context = await service.resolve(event.req);
    if (context.role === "member")
      throw new Error("You do not have permission to create a workspace.");
    const input = inputSchema.parse(await event.req.json());
    return jsonResponse(await service.create(context.auth, input.name), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});
