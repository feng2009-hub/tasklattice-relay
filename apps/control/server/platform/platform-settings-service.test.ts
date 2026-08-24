import { describe, expect, it } from "vitest";
import { providerKinds, updatePlatformSettingsSchema } from "@tali/contracts";
import { createTestPrisma } from "../test/prisma";
import { PlatformSettingsService } from "./platform-settings-service";

describe("PlatformSettingsService", () => {
  it("rejects quota configuration at the Platform scope", () => {
    const result = updatePlatformSettingsSchema.safeParse({
      runtimeImages: { openclaw: null, hermes: null },
      enabledProviderKinds: providerKinds,
      quotaDefaults: { hardBudgetUsd: 1_000 },
    });

    expect(result.success).toBe(false);
  });

  it("uses Runner deployment images until a Platform Administrator saves overrides", async () => {
    const service = new PlatformSettingsService(createTestPrisma());
    const initial = await service.get({
      ok: true,
      mode: "openshell-kubernetes",
      runtimeImages: {
        openclaw: "registry.example/openclaw:release",
        hermes: "registry.example/hermes:release",
      },
    });
    expect(initial).toMatchObject({
      runtimeImages: { openclaw: null, hermes: null },
      effectiveRuntimeImages: {
        openclaw: "registry.example/openclaw:release",
        hermes: "registry.example/hermes:release",
      },
      runtimeStatus: { available: true, mode: "openshell-kubernetes" },
      enabledProviderKinds: providerKinds,
      revision: 0,
    });

    const updated = await service.update({
      runtimeImages: {
        openclaw: "registry.example/openclaw@sha256:abc123",
        hermes: null,
      },
      enabledProviderKinds: ["openai", "anthropic"],
    }, "platform-admin", {
      ok: true,
      mode: "openshell-kubernetes",
      runtimeImages: {
        openclaw: "registry.example/openclaw:release",
        hermes: "registry.example/hermes:release",
      },
    });
    expect(updated).toMatchObject({
      effectiveRuntimeImages: {
        openclaw: "registry.example/openclaw@sha256:abc123",
        hermes: "registry.example/hermes:release",
      },
      enabledProviderKinds: ["openai", "anthropic"],
      revision: 1,
      updatedBy: "platform-admin",
    });
    await expect(service.runtimeImageOverride("openclaw"))
      .resolves.toBe("registry.example/openclaw@sha256:abc123");
    await expect(service.assertProviderEnabled("deepseek"))
      .rejects.toThrow("disabled by the Platform Administrator Provider policy");
  });
});
