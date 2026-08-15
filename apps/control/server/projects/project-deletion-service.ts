import type { AgentPlatformId } from "@tali/contracts";
import { getControlConfig } from "../config/control-config";
import { prisma } from "../db/prisma";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import {
  LiteLLMClient,
  type LiteLLMAdminClient,
} from "../providers/litellm-client";
import {
  NemoClawRunnerClient,
  type RunnerClient,
} from "../runtime/nemoclaw-runner-client";

export const PROJECT_DELETION_GRACE_PERIOD_MINUTES = 10;
export const PROJECT_DELETION_GRACE_PERIOD_MS =
  PROJECT_DELETION_GRACE_PERIOD_MINUTES * 60 * 1_000;
export const PROJECT_DELETION_LEASE_MS = 2 * 60 * 1_000;
const PROJECT_DELETION_HEARTBEAT_MS = 30 * 1_000;
const PROJECT_DELETION_RETRY_BASE_MS = 30 * 1_000;
const PROJECT_DELETION_RETRY_MAX_MS = 30 * 60 * 1_000;

export interface ProjectDeletionSchedule {
  delayMinutes: number;
  projectId: string;
  requestedAt: string;
  scheduledFor: string;
  status: "scheduled";
}

interface CleanupOptions {
  externalCleanupEnabled?: boolean;
}

export interface ProjectDeletionTaskClaim {
  attempts: number;
  leaseExpiresAt: string;
  projectId: string;
  scheduledFor: string;
  workerId: string;
}

export type ProjectDeletionWorkResult =
  | { status: "idle" }
  | { projectId: string; status: "completed" }
  | { error: string; nextAttemptAt: string; projectId: string; status: "retry" };

interface DeletionAgent {
  agentPlatform: AgentPlatformId;
  id: string;
  liteLLMTokenId?: string;
  name: string;
  sandboxName: string;
}

function record(payload: Prisma.JsonValue): Record<string, unknown> {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
}

function deletionAgent(payload: Prisma.JsonValue): DeletionAgent {
  const value = record(payload);
  const agentPlatform = value.agentPlatform;
  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.sandboxName !== "string" ||
    (agentPlatform !== "openclaw" && agentPlatform !== "hermes")
  ) {
    throw new Error(
      "Project cleanup stopped because stored Agent Instance data is incomplete.",
    );
  }
  return {
    agentPlatform,
    id: value.id,
    name: value.name,
    sandboxName: value.sandboxName,
    ...(typeof value.liteLLMTokenId === "string"
      ? { liteLLMTokenId: value.liteLLMTokenId }
      : {}),
  };
}

function optionalString(payload: Prisma.JsonValue, field: string): string | undefined {
  const value = record(payload)[field];
  return typeof value === "string" && value ? value : undefined;
}

function remoteResourceAlreadyAbsent(error: unknown): boolean {
  return error instanceof Error && /not found|does not exist|unknown (?:key|team|model)/i.test(error.message);
}

async function deleteRemote(operation: (() => Promise<void>) | undefined): Promise<void> {
  if (!operation) return;
  try {
    await operation();
  } catch (error) {
    if (!remoteResourceAlreadyAbsent(error)) throw error;
  }
}

export class ProjectDeletionService {
  private readonly externalCleanupEnabled: boolean;

  constructor(
    private readonly db: PrismaClient = prisma(),
    private readonly runner: RunnerClient = new NemoClawRunnerClient(),
    private readonly litellm: LiteLLMAdminClient = new LiteLLMClient(),
    options: CleanupOptions = {},
  ) {
    this.externalCleanupEnabled =
      options.externalCleanupEnabled ?? Boolean(getControlConfig().litellm.master_key);
  }

  async claimNext(
    workerId: string,
    referenceTime = new Date(),
  ): Promise<ProjectDeletionTaskClaim | undefined> {
    for (let scan = 0; scan < 8; scan += 1) {
      const candidate = await this.db.projectDeletionTask.findFirst({
        where: {
          nextAttemptAt: { lte: referenceTime },
          scheduledFor: { lte: referenceTime },
          OR: [
            { status: { in: ["scheduled", "retry"] } },
            {
              status: "running",
              OR: [
                { leaseExpiresAt: null },
                { leaseExpiresAt: { lte: referenceTime } },
              ],
            },
          ],
        },
        orderBy: [{ nextAttemptAt: "asc" }, { scheduledFor: "asc" }],
        select: {
          attempts: true,
          projectId: true,
          scheduledFor: true,
        },
      });
      if (!candidate) return undefined;
      const leaseExpiresAt = new Date(
        referenceTime.getTime() + PROJECT_DELETION_LEASE_MS,
      );
      const claimed = await this.db.projectDeletionTask.updateMany({
        where: {
          projectId: candidate.projectId,
          nextAttemptAt: { lte: referenceTime },
          scheduledFor: { lte: referenceTime },
          OR: [
            { status: { in: ["scheduled", "retry"] } },
            {
              status: "running",
              OR: [
                { leaseExpiresAt: null },
                { leaseExpiresAt: { lte: referenceTime } },
              ],
            },
          ],
        },
        data: {
          attempts: { increment: 1 },
          lastError: null,
          leaseExpiresAt,
          leaseOwner: workerId,
          status: "running",
        },
      });
      if (claimed.count) {
        return {
          attempts: candidate.attempts + 1,
          leaseExpiresAt: leaseExpiresAt.toISOString(),
          projectId: candidate.projectId,
          scheduledFor: candidate.scheduledFor.toISOString(),
          workerId,
        };
      }
    }
    return undefined;
  }

  async processNext(
    workerId: string,
    referenceTime = new Date(),
  ): Promise<ProjectDeletionWorkResult> {
    const claim = await this.claimNext(workerId, referenceTime);
    if (!claim) return { status: "idle" };
    const heartbeat = setInterval(() => {
      void this.renewLease(claim.projectId, workerId).catch((error) => {
        console.error("Project deletion lease renewal failed.", {
          projectId: claim.projectId,
          error,
        });
      });
    }, PROJECT_DELETION_HEARTBEAT_MS);
    heartbeat.unref();
    try {
      await this.purge(claim.projectId);
      return { projectId: claim.projectId, status: "completed" };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown cleanup error.";
      const retryDelay = Math.min(
        PROJECT_DELETION_RETRY_BASE_MS * 2 ** Math.min(claim.attempts - 1, 6),
        PROJECT_DELETION_RETRY_MAX_MS,
      );
      const nextAttemptAt = new Date(referenceTime.getTime() + retryDelay);
      await this.db.projectDeletionTask.updateMany({
        where: {
          projectId: claim.projectId,
          leaseOwner: workerId,
          status: "running",
        },
        data: {
          lastError: message,
          leaseExpiresAt: null,
          leaseOwner: null,
          nextAttemptAt,
          status: "retry",
        },
      });
      return {
        error: message,
        nextAttemptAt: nextAttemptAt.toISOString(),
        projectId: claim.projectId,
        status: "retry",
      };
    } finally {
      clearInterval(heartbeat);
    }
  }

  async renewLease(
    projectId: string,
    workerId: string,
    referenceTime = new Date(),
  ): Promise<boolean> {
    const renewed = await this.db.projectDeletionTask.updateMany({
      where: { projectId, leaseOwner: workerId, status: "running" },
      data: {
        leaseExpiresAt: new Date(
          referenceTime.getTime() + PROJECT_DELETION_LEASE_MS,
        ),
      },
    });
    return renewed.count > 0;
  }

  async purge(projectId: string): Promise<boolean> {
    const project = await this.db.project.findUnique({
      where: { id: projectId },
      select: {
        deletedAt: true,
        agents: { select: { payload: true } },
        mcpServers: { select: { litellmServerId: true } },
        knowledgeSources: { select: { payload: true } },
        modelDeployments: { select: { payload: true } },
        modelRoutings: { select: { id: true, payload: true } },
        quota: { select: { litellmTeamId: true } },
      },
    });
    if (!project) return false;
    if (!project.deletedAt) {
      throw new Error("Project cleanup requires a scheduled deletion request.");
    }

    const agents = project.agents.map(({ payload }) => deletionAgent(payload));
    await Promise.all(
      agents.map((agent) =>
        deleteRemote(() =>
          this.runner.destroySandbox(agent.sandboxName, agent.agentPlatform)
            .then(() => undefined),
        ),
      ),
    );

    if (this.externalCleanupEnabled) {
      await Promise.all(
        agents.map((agent) =>
          deleteRemote(
            agent.liteLLMTokenId
              ? () => this.litellm.revokeKey(agent.liteLLMTokenId!)
              : undefined,
          ),
        ),
      );
      await Promise.all(
        project.modelRoutings.flatMap(({ id, payload }) => {
          const alias = optionalString(payload, "publicModelAlias");
          const teamId = optionalString(payload, "liteLLMTeamId");
          return [
            alias
              ? deleteRemote(
                  this.litellm.deleteModelRoutingRoute
                    ? () => this.litellm.deleteModelRoutingRoute!(alias, id)
                    : undefined,
                )
              : Promise.resolve(),
            teamId
              ? deleteRemote(
                  this.litellm.deleteModelRoutingTeam
                    ? () => this.litellm.deleteModelRoutingTeam!(teamId)
                    : undefined,
                )
              : Promise.resolve(),
          ];
        }),
      );
      await Promise.all(
        project.modelDeployments.map(({ payload }) => {
          const modelName = optionalString(payload, "litellmModelName");
          return deleteRemote(
            modelName ? () => this.litellm.deleteModel(modelName) : undefined,
          );
        }),
      );
      await Promise.all(
        project.mcpServers.map(({ litellmServerId }) =>
          deleteRemote(
            this.litellm.deleteMcpServer
              ? () => this.litellm.deleteMcpServer!(litellmServerId)
              : undefined,
          ),
        ),
      );
      await Promise.all(
        project.knowledgeSources.map(({ payload }) => {
          const vectorStoreId = optionalString(payload, "vectorStoreId");
          return deleteRemote(
            vectorStoreId && this.litellm.deleteVectorStore
              ? () => this.litellm.deleteVectorStore!(vectorStoreId)
              : undefined,
          );
        }),
      );
      await deleteRemote(
        project.quota?.litellmTeamId && this.litellm.deleteProjectTeam
          ? () => this.litellm.deleteProjectTeam!(project.quota!.litellmTeamId!)
          : undefined,
      );
    }

    const deleted = await this.db.$transaction(async (transaction) => {
      // Agent ownership deliberately uses a restrictive membership FK. Remove
      // Instances first so the remaining Project-owned rows can use their
      // database cascades without weakening that invariant during normal use.
      await transaction.agentRecord.deleteMany({ where: { projectId } });
      return transaction.project.deleteMany({
        where: { id: projectId, deletedAt: { not: null } },
      });
    });
    return deleted.count > 0;
  }
}
