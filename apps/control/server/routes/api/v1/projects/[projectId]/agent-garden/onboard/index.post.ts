import { onboardAgentSchema } from "@tali/contracts";
import { defineHandler } from "nitro";
import {
  requireAuth,
  unauthorizedResponse,
} from "../../../../../../../auth/auth";
import {
  errorResponse,
  jsonResponse,
} from "../../../../../../../http/responses";
import {
  getAgentGardenService,
  requireProjectRole,
} from "../../../../../../../services";

export default defineHandler(async (event) => {
  let actorId: string;
  try {
    actorId = (await requireAuth(event.req)).user.id;
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    await requireProjectRole(event.req, ["admin"]);
    const input = onboardAgentSchema.parse(await event.req.json());
    const created = await (
      await getAgentGardenService(event.req)
    ).onboard(input, actorId);
    return jsonResponse(created, {
      status: 201,
      headers: {
        location:
          `/api/v1/projects/${encodeURIComponent(
            event.context.params?.projectId ?? "",
          )}/agent-garden/agents/${encodeURIComponent(created.id)}`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
