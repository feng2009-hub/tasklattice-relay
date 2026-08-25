import type { RunTelemetryEvent } from "@tali/contracts";
import { ProjectStore } from "../projects/project-store";
import type { RunTelemetryClaims } from "./run-telemetry-token";
import { RunStore } from "./run-store";

export class RunService {
  private readonly runs: RunStore;

  constructor(readonly store: ProjectStore) {
    this.runs = new RunStore(store.projectId, store.database());
  }

  async ingest(claims: RunTelemetryClaims, event: RunTelemetryEvent) {
    if (claims.projectId !== this.store.projectId) {
      throw new Error("Run telemetry Project access denied.");
    }
    const instance = await this.store.get(claims.instanceId);
    if (!instance) throw new Error("Run telemetry Instance not found.");
    if (instance.agentPlatform !== claims.agentPlatform) {
      throw new Error("Run telemetry Runtime does not match the Instance.");
    }
    return this.runs.ingest({
      instanceId: claims.instanceId,
      source: claims.agentPlatform,
      event,
    });
  }
}
