import {
  providerKinds,
  type AgentPlatformId,
  type PlatformSettingsView,
  type ProviderKind,
  type RunnerHealth,
  type UpdatePlatformSettingsInput,
} from "@tali/contracts";
import { prisma } from "../db/prisma";
import type { Prisma, PrismaClient } from "../generated/prisma/client";

const fallbackRuntimeImages = {
  openclaw: "ghcr.io/tasklattice/tali-nemoclaw-sandbox:dev",
  hermes: "ghcr.io/tasklattice/tali-nemoclaw-hermes-sandbox:dev",
} as const;

function providerKindList(value: Prisma.JsonValue | null | undefined): ProviderKind[] {
  if (value === null || value === undefined) return [...providerKinds];
  if (!Array.isArray(value)) return [...providerKinds];
  const allowed = new Set<string>(providerKinds);
  return value.filter(
    (item): item is ProviderKind => typeof item === "string" && allowed.has(item),
  );
}

export class PlatformSettingsService {
  constructor(private readonly db: PrismaClient = prisma()) {}

  private stored() {
    return this.db.platformSettingsRecord.findUnique({
      where: { id: "platform" },
    });
  }

  async runtimeImageOverride(
    agentPlatform: AgentPlatformId,
  ): Promise<string | null> {
    const settings = await this.stored();
    return agentPlatform === "openclaw"
      ? settings?.openclawSandboxImage ?? null
      : settings?.hermesSandboxImage ?? null;
  }

  async assertProviderEnabled(provider: ProviderKind): Promise<void> {
    const settings = await this.stored();
    if (!providerKindList(settings?.enabledProviderKinds).includes(provider)) {
      throw new Error(
        `${provider} is disabled by the Platform Administrator Provider policy.`,
      );
    }
  }

  async get(health?: RunnerHealth): Promise<PlatformSettingsView> {
    const [settings, departments, projects, people, instances, providerConnections] =
      await Promise.all([
        this.stored(),
        this.db.department.count({ where: { status: "active" } }),
        this.db.project.count({ where: { deletedAt: null } }),
        this.db.user.count({ where: { status: "active" } }),
        this.db.agentRecord.count(),
        this.db.providerAccountRecord.count(),
      ]);
    const openclawOverride = settings?.openclawSandboxImage ?? null;
    const hermesOverride = settings?.hermesSandboxImage ?? null;
    return {
      runtimeImages: {
        openclaw: openclawOverride,
        hermes: hermesOverride,
      },
      effectiveRuntimeImages: {
        openclaw:
          openclawOverride
          ?? health?.runtimeImages?.openclaw
          ?? fallbackRuntimeImages.openclaw,
        hermes:
          hermesOverride
          ?? health?.runtimeImages?.hermes
          ?? fallbackRuntimeImages.hermes,
      },
      runtimeStatus: {
        available: health?.ok === true,
        ...(health?.mode ? { mode: health.mode } : {}),
      },
      enabledProviderKinds: providerKindList(settings?.enabledProviderKinds),
      summary: {
        departments,
        projects,
        people,
        instances,
        providerConnections,
      },
      revision: settings?.revision ?? 0,
      updatedAt: settings?.updatedAt.toISOString() ?? null,
      updatedBy: settings?.updatedBy ?? null,
    };
  }

  async update(
    input: UpdatePlatformSettingsInput,
    actor: string,
    health?: RunnerHealth,
  ): Promise<PlatformSettingsView> {
    await this.db.platformSettingsRecord.upsert({
      where: { id: "platform" },
      create: {
        id: "platform",
        openclawSandboxImage: input.runtimeImages.openclaw,
        hermesSandboxImage: input.runtimeImages.hermes,
        enabledProviderKinds: input.enabledProviderKinds,
        updatedBy: actor,
      },
      update: {
        openclawSandboxImage: input.runtimeImages.openclaw,
        hermesSandboxImage: input.runtimeImages.hermes,
        enabledProviderKinds: input.enabledProviderKinds,
        updatedBy: actor,
        revision: { increment: 1 },
      },
    });
    return this.get(health);
  }
}
