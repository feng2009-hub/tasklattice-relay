import { createHash } from "node:crypto";
import { getControlConfig } from "../config/control-config";
import { prisma } from "../db/prisma";
import type { PrismaClient } from "../generated/prisma/client";
import {
  createProjectNamespaceClient,
  type ProjectNamespaceClient,
} from "../kubernetes/project-namespace-client";

const RUNTIME_TARGET_LEASE_MS = 2 * 60 * 1_000;
const RUNTIME_TARGET_RETRY_BASE_MS = 30 * 1_000;
const RUNTIME_TARGET_RETRY_MAX_MS = 30 * 60 * 1_000;

export interface ProjectRuntimeTargetClaim {
  attempts: number;
  clusterId: string;
  generation: number;
  namespace: string;
  projectId: string;
  workerId: string;
}

export type ProjectRuntimeTargetWorkResult =
  | { status: "idle" }
  | { namespace: string; projectId: string; status: "ready" }
  | {
      error: string;
      namespace: string;
      nextAttemptAt: string;
      projectId: string;
      status: "retry";
    };

export function projectRuntimeNamespace(
  projectId: string,
  prefix = getControlConfig().runtime_namespaces.name_prefix,
): string {
  // MD5 is used only to produce a deterministic opaque DNS label. It is not a
  // security primitive. The complete Project ID remains in the database.
  const identifier = createHash("md5").update(projectId).digest("hex");
  return `${prefix}-${identifier}`;
}

export class ProjectRuntimeTargetService {
  private readonly config = getControlConfig().runtime_namespaces;
  private readonly namespaces: ProjectNamespaceClient;

  constructor(
    private readonly db: PrismaClient = prisma(),
    namespaces?: ProjectNamespaceClient,
  ) {
    this.namespaces = namespaces ?? createProjectNamespaceClient(this.config);
  }

  async claimNext(
    workerId: string,
    referenceTime = new Date(),
  ): Promise<ProjectRuntimeTargetClaim | undefined> {
    if (!this.config.enabled) return undefined;
    for (let scan = 0; scan < 8; scan += 1) {
      const candidate = await this.db.projectRuntimeTarget.findFirst({
        where: {
          nextAttemptAt: { lte: referenceTime },
          project: { deletedAt: null },
          OR: [
            { status: { in: ["pending", "ready", "retry"] } },
            {
              status: "reconciling",
              OR: [
                { leaseExpiresAt: null },
                { leaseExpiresAt: { lte: referenceTime } },
              ],
            },
          ],
        },
        orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
        select: {
          attempts: true,
          clusterId: true,
          generation: true,
          namespace: true,
          projectId: true,
        },
      });
      if (!candidate) return undefined;
      const leaseExpiresAt = new Date(
        referenceTime.getTime() + RUNTIME_TARGET_LEASE_MS,
      );
      const claimed = await this.db.projectRuntimeTarget.updateMany({
        where: {
          projectId: candidate.projectId,
          nextAttemptAt: { lte: referenceTime },
          OR: [
            { status: { in: ["pending", "ready", "retry"] } },
            {
              status: "reconciling",
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
          status: "reconciling",
        },
      });
      if (claimed.count) {
        return {
          ...candidate,
          attempts: candidate.attempts + 1,
          workerId,
        };
      }
    }
    return undefined;
  }

  async processNext(
    workerId: string,
    referenceTime = new Date(),
  ): Promise<ProjectRuntimeTargetWorkResult> {
    const claim = await this.claimNext(workerId, referenceTime);
    if (!claim) return { status: "idle" };
    try {
      this.assertConfiguredCluster(claim.clusterId);
      await this.namespaces.reconcile({
        namespace: claim.namespace,
        platformNamespace: process.env.POD_NAMESPACE ?? "tali",
        projectId: claim.projectId,
        runtimeNamespaces: this.config,
      });
      await this.db.projectRuntimeTarget.updateMany({
        where: {
          projectId: claim.projectId,
          leaseOwner: workerId,
          status: "reconciling",
        },
        data: {
          attempts: 0,
          lastError: null,
          lastReconciledAt: referenceTime,
          leaseExpiresAt: null,
          leaseOwner: null,
          nextAttemptAt: new Date(
            referenceTime.getTime() +
              this.config.resync_interval_seconds * 1_000,
          ),
          observedGeneration: claim.generation,
          status: "ready",
        },
      });
      return {
        namespace: claim.namespace,
        projectId: claim.projectId,
        status: "ready",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown reconciliation error.";
      const retryDelay = Math.min(
        RUNTIME_TARGET_RETRY_BASE_MS * 2 ** Math.min(claim.attempts - 1, 6),
        RUNTIME_TARGET_RETRY_MAX_MS,
      );
      const nextAttemptAt = new Date(referenceTime.getTime() + retryDelay);
      await this.db.projectRuntimeTarget.updateMany({
        where: {
          projectId: claim.projectId,
          leaseOwner: workerId,
          status: "reconciling",
        },
        data: {
          lastError: message.slice(0, 4_000),
          leaseExpiresAt: null,
          leaseOwner: null,
          nextAttemptAt,
          status: "retry",
        },
      });
      return {
        error: message,
        namespace: claim.namespace,
        nextAttemptAt: nextAttemptAt.toISOString(),
        projectId: claim.projectId,
        status: "retry",
      };
    }
  }

  async deleteProjectNamespace(projectId: string): Promise<boolean> {
    if (!this.config.enabled) return false;
    const target = await this.db.projectRuntimeTarget.findUnique({
      where: { projectId },
      select: { clusterId: true, namespace: true },
    });
    if (!target) return false;
    this.assertConfiguredCluster(target.clusterId);
    await this.db.projectRuntimeTarget.update({
      where: { projectId },
      data: {
        lastError: null,
        leaseExpiresAt: null,
        leaseOwner: null,
        status: "deleting",
      },
    });
    try {
      await this.namespaces.deleteAndWait(
        target.namespace,
        projectId,
        this.config.deletion_timeout_seconds * 1_000,
      );
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown namespace deletion error.";
      await this.db.projectRuntimeTarget.updateMany({
        where: { projectId },
        data: { lastError: message.slice(0, 4_000) },
      });
      throw error;
    }
  }

  private assertConfiguredCluster(clusterId: string): void {
    if (clusterId !== this.config.cluster_id) {
      throw new Error(
        `Project Runtime Target belongs to cluster ${clusterId}, but this controller manages ${this.config.cluster_id}.`,
      );
    }
  }
}
