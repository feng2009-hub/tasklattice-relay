import type { PrismaClient } from "../generated/prisma/client";
import { ProjectStore } from "../projects/project-store";
import type { LiteLLMAdminClient } from "./litellm-client";
import { LiteLLMClient } from "./litellm-client";
import { CostService } from "./cost-service";

const initialLookbackMs = 62 * 24 * 60 * 60 * 1_000;

export interface CostIngestionResult {
  attemptedProjects: number;
  syncedProjects: number;
  failedProjects: Array<{ projectId: string; error: string }>;
}

/**
 * Pulls LiteLLM spend into the PostgreSQL fact store independently from UI
 * reads. Each upstream request is filtered by the Project's LiteLLM Team, so
 * Project ownership is established before a record reaches local storage.
 */
export class CostIngestionService {
  private running: Promise<CostIngestionResult> | undefined;

  constructor(
    private readonly db: PrismaClient,
    private readonly litellm: LiteLLMAdminClient = new LiteLLMClient(),
    private readonly clock: () => Date = () => new Date(),
  ) {}

  syncAll(): Promise<CostIngestionResult> {
    if (this.running) return this.running;
    this.running = this.performSyncAll().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  private async performSyncAll(): Promise<CostIngestionResult> {
    const projects = await this.db.projectQuotaRecord.findMany({
      where: {
        litellmTeamId: { not: null },
        project: { deletedAt: null },
      },
      select: { projectId: true },
      orderBy: { projectId: "asc" },
    });
    const now = this.clock();
    const start = new Date(now.getTime() - initialLookbackMs).toISOString();
    const end = now.toISOString();
    const failedProjects: CostIngestionResult["failedProjects"] = [];
    let syncedProjects = 0;

    // Sequential Team-scoped reads keep load on LiteLLM predictable. The
    // chart currently runs one Control replica; idempotent fact keys make a
    // replay safe if an operator temporarily scales it up.
    for (const project of projects) {
      try {
        await new CostService(
          new ProjectStore(project.projectId, this.db),
          this.litellm,
        ).sync(start, end);
        syncedProjects += 1;
      } catch (error) {
        failedProjects.push({
          projectId: project.projectId,
          error: error instanceof Error ? error.message : "Unknown cost ingestion error.",
        });
      }
    }

    return {
      attemptedProjects: projects.length,
      syncedProjects,
      failedProjects,
    };
  }
}
