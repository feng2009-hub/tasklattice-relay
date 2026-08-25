import { getControlConfig } from "../config/control-config";
import { prisma } from "../db/prisma";
import type { PrismaClient } from "../generated/prisma/client";
import { decryptPlatformSecret, encryptPlatformSecret } from "./platform-secret-crypto";

export interface PlatformRuntimeConfiguration {
  controlInternalUrl: string;
  runner: { url: string; token: string };
  litellm: { url: string; masterKey: string };
  runtimeNamespaces: {
    enabled: boolean;
    clusterId: string;
    namePrefix: string;
  };
  localAuthenticationEnabled: boolean;
}

function booleanEnvironment(name: string): boolean | undefined {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return undefined;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  throw new Error(`${name} must be true or false.`);
}

export function deploymentBootstrapRuntimeConfiguration(): PlatformRuntimeConfiguration {
  const config = getControlConfig();
  return {
    controlInternalUrl:
      process.env.TALI_BOOTSTRAP_INTERNAL_URL?.trim()
      || config.server.internal_url
      || config.server.public_url
      || "",
    runner: {
      url:
        process.env.TALI_BOOTSTRAP_RUNNER_URL?.trim()
        || config.runner?.url
        || "",
      token:
        process.env.TALI_BOOTSTRAP_RUNNER_TOKEN?.trim()
        || config.runner?.token
        || "",
    },
    litellm: {
      url:
        process.env.TALI_BOOTSTRAP_LITELLM_URL?.trim()
        || config.litellm?.url
        || "",
      masterKey:
        process.env.TALI_BOOTSTRAP_LITELLM_MASTER_KEY?.trim()
        || config.litellm?.master_key
        || "",
    },
    runtimeNamespaces: {
      enabled:
        booleanEnvironment("TALI_BOOTSTRAP_RUNTIME_NAMESPACES_ENABLED")
        ?? config.runtime_namespaces.enabled,
      clusterId:
        process.env.TALI_BOOTSTRAP_RUNTIME_CLUSTER_ID?.trim()
        || config.runtime_namespaces.cluster_id,
      namePrefix:
        process.env.TALI_BOOTSTRAP_RUNTIME_NAMESPACE_PREFIX?.trim()
        || config.runtime_namespaces.name_prefix,
    },
    localAuthenticationEnabled: config.auth.local.enabled,
  };
}

export async function ensurePlatformRuntimeSettings(
  db: PrismaClient = prisma(),
): Promise<void> {
  const bootstrap = deploymentBootstrapRuntimeConfiguration();
  const config = getControlConfig();
  const current = await db.platformSettingsRecord.findUnique({
    where: { id: "platform" },
  });
  const runnerTokenEncrypted = bootstrap.runner.token
    ? encryptPlatformSecret(bootstrap.runner.token, config.auth.secret)
    : null;
  const litellmMasterKeyEncrypted = bootstrap.litellm.masterKey
    ? encryptPlatformSecret(bootstrap.litellm.masterKey, config.auth.secret)
    : null;
  if (!current) {
    await db.platformSettingsRecord.upsert({
      where: { id: "platform" },
      create: {
        id: "platform",
        controlInternalUrl: bootstrap.controlInternalUrl || null,
        runnerUrl: bootstrap.runner.url || null,
        runnerTokenEncrypted,
        litellmUrl: bootstrap.litellm.url || null,
        litellmMasterKeyEncrypted,
        runtimeNamespacesEnabled: bootstrap.runtimeNamespaces.enabled,
        runtimeClusterId: bootstrap.runtimeNamespaces.clusterId,
        runtimeNamespacePrefix: bootstrap.runtimeNamespaces.namePrefix,
        localAuthenticationEnabled: bootstrap.localAuthenticationEnabled,
        updatedBy: "system:bootstrap",
      },
      // Multiple Control replicas can bootstrap concurrently. The first
      // insert wins and later replicas never replace its imported values.
      update: {},
    });
    return;
  }
  const data = {
    ...(current.controlInternalUrl === null && bootstrap.controlInternalUrl
      ? { controlInternalUrl: bootstrap.controlInternalUrl }
      : {}),
    ...(current.runnerUrl === null && bootstrap.runner.url
      ? { runnerUrl: bootstrap.runner.url }
      : {}),
    ...(current.runnerTokenEncrypted === null && runnerTokenEncrypted
      ? { runnerTokenEncrypted }
      : {}),
    ...(current.litellmUrl === null && bootstrap.litellm.url
      ? { litellmUrl: bootstrap.litellm.url }
      : {}),
    ...(current.litellmMasterKeyEncrypted === null && litellmMasterKeyEncrypted
      ? { litellmMasterKeyEncrypted }
      : {}),
    ...(current.runtimeNamespacesEnabled === null
      ? { runtimeNamespacesEnabled: bootstrap.runtimeNamespaces.enabled }
      : {}),
    ...(current.runtimeClusterId === null
      ? { runtimeClusterId: bootstrap.runtimeNamespaces.clusterId }
      : {}),
    ...(current.runtimeNamespacePrefix === null
      ? { runtimeNamespacePrefix: bootstrap.runtimeNamespaces.namePrefix }
      : {}),
    ...(current.localAuthenticationEnabled === null
      ? { localAuthenticationEnabled: bootstrap.localAuthenticationEnabled }
      : {}),
  };
  if (Object.keys(data).length) {
    await db.platformSettingsRecord.update({
      where: { id: "platform" },
      data: { ...data, updatedBy: "system:bootstrap" },
    });
  }
}

export async function loadPlatformRuntimeConfiguration(
  db: PrismaClient = prisma(),
): Promise<PlatformRuntimeConfiguration> {
  const [settings, bootstrap] = await Promise.all([
    db.platformSettingsRecord.findUnique({ where: { id: "platform" } }),
    Promise.resolve(deploymentBootstrapRuntimeConfiguration()),
  ]);
  const config = getControlConfig();
  return {
    controlInternalUrl: settings?.controlInternalUrl || bootstrap.controlInternalUrl,
    runner: {
      url: settings?.runnerUrl || bootstrap.runner.url,
      token: settings?.runnerTokenEncrypted
        ? decryptPlatformSecret(settings.runnerTokenEncrypted, config.auth.secret)
        : bootstrap.runner.token,
    },
    litellm: {
      url: settings?.litellmUrl || bootstrap.litellm.url,
      masterKey: settings?.litellmMasterKeyEncrypted
        ? decryptPlatformSecret(settings.litellmMasterKeyEncrypted, config.auth.secret)
        : bootstrap.litellm.masterKey,
    },
    runtimeNamespaces: {
      enabled: settings?.runtimeNamespacesEnabled ?? bootstrap.runtimeNamespaces.enabled,
      clusterId: settings?.runtimeClusterId || bootstrap.runtimeNamespaces.clusterId,
      namePrefix: settings?.runtimeNamespacePrefix || bootstrap.runtimeNamespaces.namePrefix,
    },
    localAuthenticationEnabled:
      settings?.localAuthenticationEnabled ?? bootstrap.localAuthenticationEnabled,
  };
}
