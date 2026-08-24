import { createHash } from "node:crypto";
import { getControlConfig } from "../config/control-config";
import { prisma } from "../db/prisma";
import type { PrismaClient } from "../generated/prisma/client";
import { PlatformSettingsService } from "../platform/platform-settings-service";
import {
  createProjectNamespaceClient,
  type ProjectNamespaceClient,
} from "../kubernetes/project-namespace-client";

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

export function projectRuntimeNamespace(
  projectId: string,
  prefix = getControlConfig().runtime_namespaces.name_prefix,
): string {
  // SHA-256 stays available in FIPS-enabled OpenShift environments. The hash
  // is an opaque stable identifier, not a security boundary.
  const identifier = createHash("sha256")
    .update(projectId)
    .digest("hex")
    .slice(0, 32);
  return `${prefix}-${identifier}`;
}

function safeError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : "Unknown Namespace provisioning error.";
  return message.slice(0, 4_000);
}

/**
 * Performs idempotent, on-demand Namespace provisioning.
 *
 * There is deliberately no polling loop or lease. Project creation calls
 * ensureProjectNamespace synchronously, and operators can run reconcileAll
 * as a one-shot repair command after an outage or upgrade.
 */
export class ProjectRuntimeTargetService
  implements ProjectRuntimeNamespaceProvisioner
{
  private readonly config = getControlConfig().runtime_namespaces;
  private readonly namespaces: ProjectNamespaceClient;

  constructor(
    private readonly db: PrismaClient = prisma(),
    namespaces?: ProjectNamespaceClient,
  ) {
    this.namespaces = namespaces ?? createProjectNamespaceClient(this.config);
  }

  async ensureProjectNamespace(projectId: string): Promise<boolean> {
    if (!this.config.enabled) return false;
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
          clusterId: this.config.cluster_id,
          namespace: projectRuntimeNamespace(
            project.id,
            this.config.name_prefix,
          ),
          projectId: project.id,
        },
        select: {
          clusterId: true,
          generation: true,
          namespace: true,
        },
      }));
    this.assertConfiguredCluster(target.clusterId);

    try {
      await this.namespaces.reconcile({
        namespace: target.namespace,
        projectId: project.id,
        projectName: project.name,
      });
      await this.db.projectRuntimeTarget.update({
        where: { projectId: project.id },
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
      return true;
    } catch (error) {
      await this.db.projectRuntimeTarget.updateMany({
        where: { projectId: project.id },
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
    if (!this.config.enabled) return false;
    const target = await this.db.projectRuntimeTarget.findUnique({
      where: { projectId },
      select: { clusterId: true, namespace: true },
    });
    if (!target) return false;
    this.assertConfiguredCluster(target.clusterId);
    await this.db.projectRuntimeTarget.update({
      where: { projectId },
      data: { lastError: null, status: "deleting" },
    });
    try {
      const deletionTimeoutSeconds = await new PlatformSettingsService(
        this.db,
      ).runtimeNamespaceDeletionTimeoutSeconds();
      await this.namespaces.deleteAndWait(
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

  private assertConfiguredCluster(clusterId: string): void {
    if (clusterId !== this.config.cluster_id) {
      throw new Error(
        `Project Runtime Target belongs to cluster ${clusterId}, but this Control Plane manages ${this.config.cluster_id}.`,
      );
    }
  }
}
