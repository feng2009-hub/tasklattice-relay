import { runTelemetryEventSchema } from "@tali/contracts";
import { defineHandler } from "nitro";
import { errorResponse, jsonResponse } from "../../../http/responses";
import { ProjectStore } from "../../../projects/project-store";
import { RunService } from "../../../runs/run-service";
import {
  runTelemetryBearerToken,
  verifyRunTelemetryToken,
} from "../../../runs/run-telemetry-token";

export default defineHandler(async (event) => {
  let claims;
  try {
    const token = runTelemetryBearerToken(event.req);
    if (!token) throw new Error("Run telemetry authentication required.");
    claims = verifyRunTelemetryToken(token);
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unauthorized." },
      { status: 401 },
    );
  }
  try {
    const input = runTelemetryEventSchema.parse(await event.req.json());
    const run = await new RunService(new ProjectStore(claims.projectId)).ingest(claims, input);
    return jsonResponse(run, { status: input.event === "started" ? 202 : 200 });
  } catch (error) {
    return errorResponse(error);
  }
});
