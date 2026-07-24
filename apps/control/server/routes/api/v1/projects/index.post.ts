import { z } from "zod";
import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../http/responses";
import { ProjectService } from "../../../../projects/project-service";

const inputSchema = z.object({ name: z.string().trim().min(2).max(80) });

export default defineHandler(async (event) => {
  let auth;
  try { auth = requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    const service = new ProjectService();
    const input = inputSchema.parse(await event.req.json());
    return jsonResponse(await service.create(auth, input.name), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});
