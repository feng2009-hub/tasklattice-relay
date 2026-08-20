import { defineHandler } from "nitro";
import { updateProjectInputSchema } from "../../../../../api-contracts/schemas";
import { unauthorizedResponse } from "../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../http/responses";
import { ProjectService } from "../../../../../projects/project-service";

export default defineHandler(async (event) => {
  const service = new ProjectService();
  try {
    const { userId } = await service.authenticate(event.req);
    const projectId = decodeURIComponent(event.context.params?.projectId ?? "");
    const input = updateProjectInputSchema.parse(await event.req.json());
    return jsonResponse(await service.rename(projectId, userId, input.name));
  } catch (error) {
    if (error instanceof Error && error.message.includes("authentication")) return unauthorizedResponse(error);
    return errorResponse(error);
  }
});
