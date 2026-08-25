import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  developmentControlConfig,
  setControlConfigForTests,
} from "../config/control-config";
import { createTestPrisma } from "../test/prisma";
import {
  ensurePlatformRuntimeSettings,
  loadPlatformRuntimeConfiguration,
} from "./platform-runtime-config";

describe("Platform runtime configuration", () => {
  beforeEach(() => {
    setControlConfigForTests(developmentControlConfig());
    vi.stubEnv("TALI_BOOTSTRAP_INTERNAL_URL", "http://control.bootstrap");
    vi.stubEnv("TALI_BOOTSTRAP_RUNNER_URL", "http://runner.bootstrap");
    vi.stubEnv("TALI_BOOTSTRAP_RUNNER_TOKEN", "runner-bootstrap-token");
    vi.stubEnv("TALI_BOOTSTRAP_LITELLM_URL", "http://litellm.bootstrap");
    vi.stubEnv("TALI_BOOTSTRAP_LITELLM_MASTER_KEY", "litellm-bootstrap-key");
    vi.stubEnv("TALI_BOOTSTRAP_RUNTIME_NAMESPACES_ENABLED", "true");
    vi.stubEnv("TALI_BOOTSTRAP_RUNTIME_CLUSTER_ID", "cluster-bootstrap");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    setControlConfigForTests(undefined);
  });

  it("imports deployment bootstrap values into encrypted Platform settings", async () => {
    const db = createTestPrisma();

    await ensurePlatformRuntimeSettings(db);

    const stored = await db.platformSettingsRecord.findUniqueOrThrow({
      where: { id: "platform" },
    });
    expect(stored).toMatchObject({
      controlInternalUrl: "http://control.bootstrap",
      runnerUrl: "http://runner.bootstrap",
      litellmUrl: "http://litellm.bootstrap",
      runtimeNamespacesEnabled: true,
      runtimeClusterId: "cluster-bootstrap",
      localAuthenticationEnabled: true,
      updatedBy: "system:bootstrap",
    });
    expect(stored.runnerTokenEncrypted).toMatch(/^v1:/);
    expect(stored.litellmMasterKeyEncrypted).toMatch(/^v1:/);

    await expect(loadPlatformRuntimeConfiguration(db)).resolves.toEqual({
      controlInternalUrl: "http://control.bootstrap",
      runner: {
        url: "http://runner.bootstrap",
        token: "runner-bootstrap-token",
      },
      litellm: {
        url: "http://litellm.bootstrap",
        masterKey: "litellm-bootstrap-key",
      },
      runtimeNamespaces: {
        enabled: true,
        clusterId: "cluster-bootstrap",
      },
      localAuthenticationEnabled: true,
    });
  });

  it("never overwrites values already saved by a Platform Administrator", async () => {
    const db = createTestPrisma();
    await ensurePlatformRuntimeSettings(db);
    await db.platformSettingsRecord.update({
      where: { id: "platform" },
      data: {
        controlInternalUrl: "http://control.saved",
        runnerUrl: "http://runner.saved",
        runtimeNamespacesEnabled: false,
        updatedBy: "platform-admin",
      },
    });
    vi.stubEnv("TALI_BOOTSTRAP_INTERNAL_URL", "http://control.changed");
    vi.stubEnv("TALI_BOOTSTRAP_RUNNER_URL", "http://runner.changed");
    vi.stubEnv("TALI_BOOTSTRAP_RUNTIME_NAMESPACES_ENABLED", "true");

    await ensurePlatformRuntimeSettings(db);

    await expect(db.platformSettingsRecord.findUniqueOrThrow({
      where: { id: "platform" },
    })).resolves.toMatchObject({
      controlInternalUrl: "http://control.saved",
      runnerUrl: "http://runner.saved",
      runtimeNamespacesEnabled: false,
      updatedBy: "platform-admin",
    });
  });
});
