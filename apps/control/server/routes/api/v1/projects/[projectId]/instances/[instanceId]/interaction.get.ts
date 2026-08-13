import { defineHandler } from "nitro";
import { z } from "zod";
import { requireAuth, unauthorizedResponse } from "../../../../../../../auth/auth";
import { agentInteractionAccess } from "../../../../../../../agents/agent-http-view";
import { errorResponse, jsonResponse } from "../../../../../../../http/responses";
import { getAgentService } from "../../../../../../../services";

export default defineHandler(async (event) => {
  let subject: string;
  try {
    subject = requireAuth(event.req).user.id;
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    const id = z.string().uuid().parse(event.context.params?.instanceId);
    const service = await getAgentService(event.req);
    const agent = await service.get(id);
    const httpEndpoint =
      agent?.status === "READY" && agent.httpEndpoint?.status === "READY"
        ? await service.runner.getSandboxInteraction(
            agent.sandboxName,
            agent.agentPlatform,
            subject,
          )
        : agent?.httpEndpoint;
    return agent
      ? jsonResponse(agentInteractionAccess(agent, httpEndpoint), {
          headers: { "cache-control": "no-store" },
        })
      : jsonResponse({ error: "Agent not found." }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
});
