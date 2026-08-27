import { defineHandler } from "nitro";
import { errorResponse, jsonResponse, problemResponse } from "../../../../../../../http/responses";
import {
  requireProjectRuntimeBridge,
  requireProjectRuntimeCoordinator,
} from "../../../../../../../runtime-bridge/project-runtime-bridge-auth";
import { ProjectVectorDatabaseRuntimeService } from "../../../../../../../runtime-bridge/project-vector-database-runtime-service";

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
      data: await new ProjectVectorDatabaseRuntimeService(projectId).list(
        coordinatorInstanceId,
      ),
    });
  } catch (error) {
    return errorResponse(error);
  }
});
