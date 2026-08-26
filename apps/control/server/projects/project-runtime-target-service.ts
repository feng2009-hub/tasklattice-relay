import { createHash, randomUUID } from "node:crypto";
import { prisma } from "../db/prisma";
import type { PrismaClient } from "../generated/prisma/client";
import { PlatformSettingsService } from "../platform/platform-settings-service";
import {
  loadPlatformRuntimeConfiguration,
} from "../platform/platform-runtime-config";
import {
  createProjectNamespaceClient,
  type ProjectNamespaceClient,
} from "../kubernetes/project-namespace-client";
import {
  createProjectOpenShellGatewayClient,
  type ProjectOpenShellGatewayClient,
} from "../kubernetes/project-openshell-gateway-client";

export interface ProjectRuntimeNamespaceProvisioner {
  ensureProjectNamespace(projectId: string): Promise<boolean>;
}

export interface ProjectRuntimeReconciliationFailure {
  error: string;
  projectId: string;
}

export interface ProjectRuntimeReconciliationSummary {
  failed: number;
  failures: ProjectRuntimeReconciliationFailure[];
  ready: number;
  skipped: number;
  total: number;
}

const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";
const PROJECT_RUNTIME_IDENTIFIER_BYTES = 10;

export const OPENSHELL_ROUTABLE_NAME_MAX_LENGTH = 19;
export const PROJECT_RUNTIME_NAMESPACE_PREFIX = "tp-";

function encodeBase32(input: Uint8Array): string {
  let accumulator = 0;
  let bits = 0;
  let result = "";
  for (const byte of input) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += BASE32_ALPHABET[(accumulator >> bits) & 31];
      accumulator &= (1 << bits) - 1;
    }
  }
  return result;
}

export function projectRuntimeNamespace(projectId: string): string {
  // Ten SHA-256 bytes encode to exactly 16 lowercase Base32 characters. With
  // the fixed prefix the result is a 19-character DNS-1123 label that can be
  // used unchanged as an OpenShell workspace, namespace, or route segment.
  const identifier = encodeBase32(
    createHash("sha256")
      .update(projectId)
      .digest()
      .subarray(0, PROJECT_RUNTIME_IDENTIFIER_BYTES),
  );
  return `${PROJECT_RUNTIME_NAMESPACE_PREFIX}${identifier}`;
}

function safeError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : "Unknown Namespace provisioning error.";
  return message.slice(0, 4_000);
}

const PROJECT_RUNTIME_RECONCILE_LEASE_MS = 10 * 60 * 1_000;

/**
 * Performs idempotent Namespace provisioning for both synchronous creation
 * and durable Control Worker reconciliation.
 *
 * Project creation calls ensureProjectNamespace synchronously. The Worker
 * fans out stale Project targets into individual jobs, while reconcileAll
 * remains available as a one-shot operator repair command.
 */
export class ProjectRuntimeTargetService
  implements ProjectRuntimeNamespaceProvisioner
{
  constructor(
    private readonly db: PrismaClient = prisma(),
    private readonly namespaces?: ProjectNamespaceClient,
    private readonly gateways?: ProjectOpenShellGatewayClient,
  ) {}

  async ensureProjectNamespace(projectId: string): Promise<boolean> {
    const runtime = (await loadPlatformRuntimeConfiguration(this.db)).runtimeNamespaces;
    if (!runtime.enabled) return false;
    const namespaces = this.namespaces ?? createProjectNamespaceClient({
      enabled: runtime.enabled,
    });
    const gateways = this.gateways ?? createProjectOpenShellGatewayClient();
    const project = await this.db.project.findUnique({
      where: { id: projectId },
      select: {
        deletedAt: true,
        id: true,
        name: true,
        runtimeTarget: {
          select: {
            clusterId: true,
            generation: true,
            namespace: true,
          },
        },
      },
    });
    if (!project || project.deletedAt) {
      throw new Error(`Project ${projectId} was not found or is being deleted.`);
    }

    const target =
      project.runtimeTarget ??
      (await this.db.projectRuntimeTarget.create({
        data: {
          clusterId: runtime.clusterId,
          namespace: projectRuntimeNamespace(project.id),
          projectId: project.id,
        },
        select: {
          clusterId: true,
          generation: true,
          namespace: true,
        },
      }));
    this.assertConfiguredCluster(target.clusterId, runtime.clusterId);

    const reconciliationId = randomUUID();
    const referenceTime = new Date();
    try {
      const claimed = await this.db.projectRuntimeTarget.updateMany({
        where: {
          generation: target.generation,
          projectId: project.id,
          status: { not: "deleting" },
          OR: [
            { status: { not: "reconciling" } },
            { leaseExpiresAt: null },
            { leaseExpiresAt: { lte: referenceTime } },
          ],
        },
        data: {
          attempts: { increment: 1 },
          lastError: null,
          leaseExpiresAt: new Date(
            referenceTime.getTime() + PROJECT_RUNTIME_RECONCILE_LEASE_MS,
          ),
          leaseOwner: reconciliationId,
          status: "reconciling",
        },
      });
      if (!claimed.count) {
        throw new Error(
          `Project Runtime Target ${project.id} changed or started deleting before generation ${target.generation} could be reconciled.`,
        );
      }
      await namespaces.reconcile({
        namespace: target.namespace,
        projectId: project.id,
        projectName: project.name,
      });
      await gateways.reconcile({
        namespace: target.namespace,
        projectId: project.id,
        projectName: project.name,
      });
      const observed = await this.db.projectRuntimeTarget.updateMany({
        where: {
          generation: target.generation,
          leaseOwner: reconciliationId,
          projectId: project.id,
          status: "reconciling",
        },
        data: {
          attempts: 0,
          lastError: null,
          lastReconciledAt: new Date(),
          leaseExpiresAt: null,
          leaseOwner: null,
          observedGeneration: target.generation,
          status: "ready",
        },
      });
      if (!observed.count) {
        throw new Error(
          `Project Runtime Target ${project.id} changed while generation ${target.generation} was being reconciled.`,
        );
      }
      return true;
    } catch (error) {
      await this.db.projectRuntimeTarget.updateMany({
        where: {
          generation: target.generation,
          leaseOwner: reconciliationId,
          projectId: project.id,
          status: "reconciling",
        },
        data: {
          lastError: safeError(error),
          leaseExpiresAt: null,
          leaseOwner: null,
          status: "retry",
        },
      });
      throw error;
    }
  }

  async reconciliationCandidateIds(
    referenceTime = new Date(),
    resyncIntervalMs = 5 * 60 * 1_000,
  ): Promise<string[]> {
    const runtime = (await loadPlatformRuntimeConfiguration(this.db)).runtimeNamespaces;
    if (!runtime.enabled) return [];
    const projects = await this.db.project.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        runtimeTarget: {
          select: {
            lastReconciledAt: true,
            leaseExpiresAt: true,
            status: true,
          },
        },
      },
    });
    const staleBefore = referenceTime.getTime() - resyncIntervalMs;
    return projects
      .filter(({ runtimeTarget }) =>
        !runtimeTarget
        || (
          runtimeTarget.status !== "reconciling"
          || !runtimeTarget.leaseExpiresAt
          || runtimeTarget.leaseExpiresAt <= referenceTime
        ) && (
          runtimeTarget.status !== "ready"
          || !runtimeTarget.lastReconciledAt
          || runtimeTarget.lastReconciledAt.getTime() <= staleBefore
        )
      )
      .map(({ id }) => id);
  }

  async reconcileAll(): Promise<ProjectRuntimeReconciliationSummary> {
    const projects = await this.db.project.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    const summary: ProjectRuntimeReconciliationSummary = {
      failed: 0,
      failures: [],
      ready: 0,
      skipped: 0,
      total: projects.length,
    };
    for (const project of projects) {
      try {
        if (await this.ensureProjectNamespace(project.id)) summary.ready += 1;
        else summary.skipped += 1;
      } catch (error) {
        summary.failed += 1;
        summary.failures.push({
          error: safeError(error),
          projectId: project.id,
        });
      }
    }
    return summary;
  }

  async deleteProjectNamespace(projectId: string): Promise<boolean> {
    const runtime = (await loadPlatformRuntimeConfiguration(this.db)).runtimeNamespaces;
    if (!runtime.enabled) return false;
    const namespaces = this.namespaces ?? createProjectNamespaceClient({
      enabled: runtime.enabled,
    });
    const gateways = this.gateways ?? createProjectOpenShellGatewayClient();
    const target = await this.db.projectRuntimeTarget.findUnique({
      where: { projectId },
      select: { clusterId: true, namespace: true },
    });
    if (!target) return false;
    this.assertConfiguredCluster(target.clusterId, runtime.clusterId);
    await this.db.projectRuntimeTarget.update({
      where: { projectId },
      data: { lastError: null, status: "deleting" },
    });
    try {
      await gateways.delete(target.namespace);
      const deletionTimeoutSeconds = await new PlatformSettingsService(
        this.db,
      ).runtimeNamespaceDeletionTimeoutSeconds();
      await namespaces.deleteAndWait(
        target.namespace,
        projectId,
        deletionTimeoutSeconds * 1_000,
      );
      return true;
    } catch (error) {
      await this.db.projectRuntimeTarget.updateMany({
        where: { projectId },
        data: { lastError: safeError(error) },
      });
      throw error;
    }
  }

  private assertConfiguredCluster(clusterId: string, configuredClusterId: string): void {
    if (clusterId !== configuredClusterId) {
      throw new Error(
        `Project Runtime Target belongs to cluster ${clusterId}, but this Control Plane manages ${configuredClusterId}.`,
      );
    }
  }
}
