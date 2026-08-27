import { defineHandler } from "nitro";
import {
  requireAuth,
  unauthorizedResponse,
} from "../../../../../../../../auth/auth";
import {
  errorResponse,
  jsonResponse,
  problemResponse,
} from "../../../../../../../../http/responses";
import {
  getAgentGardenService,
  requireProjectRole,
} from "../../../../../../../../services";

export default defineHandler(async (event) => {
  try {
    await requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    await requireProjectRole(event.req, ["admin"]);
    const id = decodeURIComponent(event.context.params?.id ?? "");
    const removed = await (
      await getAgentGardenService(event.req)
    ).removeInstance(id);
    if (!removed) {
      return problemResponse(404, "A2A Instance was not found.");
    }
    return jsonResponse({ message: "A2A Instance removed." });
  } catch (error) {
    return errorResponse(error);
  }
});
