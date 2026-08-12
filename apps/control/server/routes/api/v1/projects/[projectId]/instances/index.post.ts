import { createAgentSchema } from "@tali/contracts";
import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../http/responses";
import { getAgentService } from "../../../../../../services";
import { agentConfigurationView } from "../../../../../../agents/agent-http-view";

export default defineHandler(async (event) => {
  let actorId: string;
  try {
    actorId = requireAuth(event.req).sub;
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    const input = createAgentSchema.parse(await event.req.json());
    const agent = await (await getAgentService(event.req)).create(input, actorId);
    return jsonResponse(agentConfigurationView(agent), {
      status: 202,
      headers: { location: `/api/v1/projects/${encodeURIComponent(event.context.params?.projectId ?? "")}/instances/${agent.id}` },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
