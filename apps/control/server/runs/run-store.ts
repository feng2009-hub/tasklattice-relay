import { createHash } from "node:crypto";
import type {
  ProjectRun,
  ProjectRunSource,
  RunTelemetryEvent,
} from "@tali/contracts";
import type { PrismaClient } from "../generated/prisma/client";

function iso(value: Date): string {
  return value.toISOString();
}

function runId(instanceId: string, source: ProjectRunSource, externalRunId: string): string {
  return createHash("sha256")
    .update(`${source}\0${instanceId}\0${externalRunId}`)
    .digest("hex");
}

type RunRow = Awaited<ReturnType<PrismaClient["projectRunRecord"]["findFirstOrThrow"]>>;

function view(row: RunRow): ProjectRun {
  return {
    id: row.id,
    projectId: row.projectId,
    instanceId: row.instanceId,
    agentPlatform: row.agentPlatform as ProjectRunSource,
    source: row.source as ProjectRunSource,
    externalRunId: row.externalRunId,
    triggerType: row.triggerType as ProjectRun["triggerType"],
    status: row.status as ProjectRun["status"],
    ...(row.traceId ? { traceId: row.traceId } : {}),
    startedAt: iso(row.startedAt),
    ...(row.endedAt ? { endedAt: iso(row.endedAt) } : {}),
    ...(row.durationMs === null ? {} : { durationMs: row.durationMs }),
    ...(row.terminalReason ? { terminalReason: row.terminalReason } : {}),
    ...(row.errorCategory ? { errorCategory: row.errorCategory } : {}),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

const terminalStatuses = new Set(["SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED", "BLOCKED"]);

export class RunStore {
  constructor(
    readonly projectId: string,
    private readonly db: PrismaClient,
  ) {}

  async ingest(input: {
    instanceId: string;
    source: ProjectRunSource;
    event: RunTelemetryEvent;
  }): Promise<ProjectRun> {
    const id = runId(input.instanceId, input.source, input.event.runId);
    const occurredAt = new Date(input.event.occurredAt);
    const row = await this.db.$transaction(async (transaction) => {
      const current = await transaction.projectRunRecord.findUnique({
        where: { projectId_id: { projectId: this.projectId, id } },
      });

      if (input.event.event === "started") {
        if (current) return current;
        return transaction.projectRunRecord.create({
          data: {
            projectId: this.projectId,
            id,
            instanceId: input.instanceId,
            agentPlatform: input.source,
            source: input.source,
            externalRunId: input.event.runId,
            triggerType: input.event.triggerType,
            status: "RUNNING",
            ...(input.event.traceId ? { traceId: input.event.traceId } : {}),
            startedAt: occurredAt,
          },
        });
      }

      if (current && terminalStatuses.has(current.status)) return current;
      const durationMs = input.event.durationMs
        ?? (current ? Math.max(0, occurredAt.getTime() - current.startedAt.getTime()) : undefined);
      const startedAt = current?.startedAt
        ?? new Date(occurredAt.getTime() - (durationMs ?? 0));
      const terminal = {
        status: input.event.status,
        endedAt: occurredAt,
        ...(durationMs === undefined ? {} : { durationMs }),
        ...(input.event.terminalReason ? { terminalReason: input.event.terminalReason } : {}),
        ...(input.event.errorCategory ? { errorCategory: input.event.errorCategory } : {}),
        ...(input.event.traceId ? { traceId: input.event.traceId } : {}),
      };
      if (current) {
        return transaction.projectRunRecord.update({
          where: { projectId_id: { projectId: this.projectId, id } },
          data: terminal,
        });
      }
      return transaction.projectRunRecord.create({
        data: {
          projectId: this.projectId,
          id,
          instanceId: input.instanceId,
          agentPlatform: input.source,
          source: input.source,
          externalRunId: input.event.runId,
          triggerType: "UNKNOWN",
          startedAt,
          ...terminal,
        },
      });
    });
    return view(row);
  }

  async get(instanceId: string, source: ProjectRunSource, externalRunId: string): Promise<ProjectRun | undefined> {
    const row = await this.db.projectRunRecord.findUnique({
      where: {
        projectId_id: {
          projectId: this.projectId,
          id: runId(instanceId, source, externalRunId),
        },
      },
    });
    return row ? view(row) : undefined;
  }
}
