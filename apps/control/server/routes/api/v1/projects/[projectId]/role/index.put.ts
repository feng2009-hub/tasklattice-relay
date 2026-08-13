import { assignableProjectMembershipRoles } from "@tali/contracts";
import { defineHandler } from "nitro";
import { z } from "zod";
import { unauthorizedResponse } from "../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../http/responses";
import { ProjectService } from "../../../../../../projects/project-service";

const inputSchema = z.object({
  role: z.enum(assignableProjectMembershipRoles),
});

export default defineHandler(async (event) => {
  const projects = new ProjectService();
  try {
    const { userId } = await projects.authenticate(event.req);
    const input = inputSchema.parse(await event.req.json());
    return jsonResponse(await projects.switchRole(
      decodeURIComponent(event.context.params?.projectId ?? ""),
      userId,
      input.role,
    ));
  } catch (error) {
    if (error instanceof Error && error.message.includes("authentication")) {
      return unauthorizedResponse(error);
    }
    return errorResponse(error);
  }
});
