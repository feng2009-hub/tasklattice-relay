import { defineHandler } from "nitro";
import { errorResponse, jsonResponse, problemResponse } from "../../../../../../../http/responses";
import { ProjectAgentRuntimeService } from "../../../../../../../runtime-bridge/project-agent-runtime-service";
import {
  requireProjectRuntimeBridge,
  requireProjectRuntimeCoordinator,
} from "../../../../../../../runtime-bridge/project-runtime-bridge-auth";

export default defineHandler(async (event) => {
  let projectId: string;
  const coordinatorInstanceId = decodeURIComponent(
    event.context.params?.coordinatorInstanceId ?? "",
  );
  try {
    const bridge = await requireProjectRuntimeBridge(event.req);
    await requireProjectRuntimeCoordinator(
      event.req,
      bridge,
      coordinatorInstanceId,
    );
    projectId = bridge.projectId;
  } catch (error) {
    return problemResponse(401, error instanceof Error ? error.message : "Unauthorized.");
  }
  try {
    return jsonResponse({
      data: await new ProjectAgentRuntimeService(projectId).listPeers(
        coordinatorInstanceId,
      ),
    });
  } catch (error) {
    return errorResponse(error);
  }
});
