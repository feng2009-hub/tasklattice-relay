import {
  providerKinds,
  type AgentPlatformId,
  type ExternalRoleBindingView,
  type PlatformEmailValidationView,
  type PlatformEmailSettingsView,
  type PlatformSecuritySettingsView,
  type PlatformSettingsView,
  type PlatformSsoValidationView,
  type ProviderKind,
  type RunnerHealth,
  type UpdatePlatformSecuritySettingsInput,
  type UpdatePlatformEmailSettingsInput,
  type UpdatePlatformSettingsInput,
  type ValidatePlatformEmailSettingsInput,
  type ValidatePlatformSsoSettingsInput,
} from "@tali/contracts";
import { getControlConfig } from "../config/control-config";
import { prisma } from "../db/prisma";
import {
  verifySmtpConnection,
  type SmtpConnectionSettings,
} from "../email/smtp-transport";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import {
  decryptPlatformSecret,
  encryptPlatformSecret,
} from "./platform-secret-crypto";
import { ExternalRoleBindingService } from "../auth/external-role-bindings";

const fallbackRuntimeImages = {
  openclaw: "ghcr.io/tasklattice/tali-nemoclaw-sandbox:dev",
  hermes: "ghcr.io/tasklattice/tali-nemoclaw-hermes-sandbox:dev",
} as const;

const fallbackSandboxDefaults = {
  cpu: "1",
  memory: "2Gi",
} as const;

function providerKindList(value: Prisma.JsonValue | null | undefined): ProviderKind[] {
  if (value === null || value === undefined) return [...providerKinds];
  if (!Array.isArray(value)) return [...providerKinds];
  const allowed = new Set<string>(providerKinds);
  return value.filter(
    (item): item is ProviderKind => typeof item === "string" && allowed.has(item),
  );
}

function normalizedHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export interface PlatformAuthRuntimeSettings {
  localAuthenticationEnabled: boolean;
  revision: number;
  sso: {
    clientId: string;
    clientSecret: string;
    displayName: string;
    enabled: boolean;
    groupClaim: string;
    issuer: string;
  };
}

export interface PlatformEmailRuntimeSettings extends PlatformEmailSettingsView {
  password: string;
}

interface OidcDiscoveryDocument {
  authorizationEndpoint: string;
  discoveryUrl: string;
  issuer: string;
  jwksUri: string;
  tokenEndpoint: string;
}

export class PlatformSettingsService {
  constructor(
    private readonly db: PrismaClient = prisma(),
    private readonly oidcFetch: typeof fetch = fetch,
    private readonly smtpVerify: (
      settings: SmtpConnectionSettings,
    ) => Promise<void> = verifySmtpConnection,
  ) {}

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

  async sandboxProvisioningOverrides(): Promise<{
    cpu?: string;
    memory?: string;
  } | null> {
    const settings = await this.stored();
    if (!settings?.sandboxCpu && !settings?.sandboxMemory) return null;
    return {
      ...(settings.sandboxCpu ? { cpu: settings.sandboxCpu } : {}),
      ...(settings.sandboxMemory ? { memory: settings.sandboxMemory } : {}),
    };
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
    const settings = await this.stored();
    const roleBindings = await new ExternalRoleBindingService(this.db).list();
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
      sandbox: {
        cpu: settings?.sandboxCpu ?? null,
        memory: settings?.sandboxMemory ?? null,
      },
      effectiveSandbox: {
        cpu:
          settings?.sandboxCpu
          ?? health?.sandbox?.cpu
          ?? fallbackSandboxDefaults.cpu,
        memory:
          settings?.sandboxMemory
          ?? health?.sandbox?.memory
          ?? fallbackSandboxDefaults.memory,
      },
      sandboxRuntime: {
        available: health?.ok === true && health?.sandbox?.provider === "openshell",
        provider: "openshell",
        ...(health?.mode ? { mode: health.mode } : {}),
        ...(health?.sandbox?.gatewayEndpoint
          ? { gatewayEndpoint: health.sandbox.gatewayEndpoint }
          : {}),
        ...(health?.sandbox?.workspace
          ? { workspace: health.sandbox.workspace }
          : {}),
        ...(health?.sandbox?.serviceBaseUrl
          ? { serviceBaseUrl: health.sandbox.serviceBaseUrl }
          : {}),
        ...(health?.sandbox?.kubernetesServiceCidrs
          ? { kubernetesServiceCidrs: health.sandbox.kubernetesServiceCidrs }
          : {}),
        ...(health?.sandbox?.gatewayImage
          ? { gatewayImage: health.sandbox.gatewayImage }
          : {}),
        ...(health?.sandbox?.supervisorImage
          ? { supervisorImage: health.sandbox.supervisorImage }
          : {}),
        ...(health?.sandbox?.defaultImage
          ? { defaultImage: health.sandbox.defaultImage }
          : {}),
        ...(health?.sandbox?.defaultImagePullPolicy
          ? { defaultImagePullPolicy: health.sandbox.defaultImagePullPolicy }
          : {}),
        ...(health?.sandbox?.tlsDisabled !== undefined
          ? { tlsDisabled: health.sandbox.tlsDisabled }
          : {}),
      },
      runtimeStatus: {
        available: health?.ok === true,
        ...(health?.mode ? { mode: health.mode } : {}),
      },
      runtimePolicy: {
        namespaceDeletionTimeoutSeconds:
          settings?.runtimeNamespaceDeletionTimeoutSeconds ?? 120,
      },
      security: this.securityView(settings, roleBindings),
      email: this.emailView(settings),
      enabledProviderKinds: providerKindList(settings?.enabledProviderKinds),
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
        sandboxCpu: input.sandbox.cpu,
        sandboxMemory: input.sandbox.memory,
        enabledProviderKinds: input.enabledProviderKinds,
        runtimeNamespaceDeletionTimeoutSeconds:
          input.runtimePolicy.namespaceDeletionTimeoutSeconds,
        updatedBy: actor,
      },
      update: {
        openclawSandboxImage: input.runtimeImages.openclaw,
        hermesSandboxImage: input.runtimeImages.hermes,
        sandboxCpu: input.sandbox.cpu,
        sandboxMemory: input.sandbox.memory,
        enabledProviderKinds: input.enabledProviderKinds,
        runtimeNamespaceDeletionTimeoutSeconds:
          input.runtimePolicy.namespaceDeletionTimeoutSeconds,
        updatedBy: actor,
        revision: { increment: 1 },
      },
    });
    return this.get(health);
  }

  async authRuntimeSettings(): Promise<PlatformAuthRuntimeSettings> {
    const settings = await this.stored();
    const config = getControlConfig();
    if (!settings) {
      return {
        localAuthenticationEnabled: config.auth.local.enabled,
        revision: 0,
        sso: {
          clientId: "",
          clientSecret: "",
          displayName: "SSO",
          enabled: false,
          groupClaim: "groups",
          issuer: "",
        },
      };
    }
    try {
      return {
        localAuthenticationEnabled: config.auth.local.enabled,
        revision: settings.revision,
        sso: {
          clientId: settings.oidcClientId,
          clientSecret: settings.oidcClientSecretEncrypted
            ? decryptPlatformSecret(
                settings.oidcClientSecretEncrypted,
                config.auth.secret,
              )
            : "",
          displayName: settings.oidcDisplayName,
          enabled: settings.oidcEnabled,
          groupClaim: settings.oidcGroupClaim,
          issuer: settings.oidcIssuer,
        },
      };
    } catch (error) {
      if (!config.auth.local.enabled) throw error;
      console.error(
        "Platform SSO override is unreadable; continuing with Local authentication only.",
        error,
      );
      return {
        localAuthenticationEnabled: true,
        revision: settings.revision,
        sso: {
          clientId: "",
          clientSecret: "",
          displayName: settings.oidcDisplayName,
          enabled: false,
          groupClaim: settings.oidcGroupClaim,
          issuer: "",
        },
      };
    }
  }

  async authRevisionKey(): Promise<string> {
    const settings = await this.stored();
    return String(settings?.revision ?? 0);
  }

  async updateSecurity(
    input: UpdatePlatformSecuritySettingsInput,
    actor: string,
  ): Promise<PlatformSecuritySettingsView> {
    const config = getControlConfig();
    if (!config.auth.local.enabled) {
      throw new Error(
        "Online SSO changes require Local authentication as a recovery path.",
      );
    }
    const current = await this.stored();
    const effectiveSecret = input.sso.clientSecret.action === "replace"
      ? input.sso.clientSecret.value
      : input.sso.clientSecret.action === "clear"
        ? ""
        : this.currentClientSecret(current);
    if (input.sso.enabled && !effectiveSecret) {
      throw new Error("A Client secret is required when SSO is enabled.");
    }
    if (input.sso.enabled) {
      await this.validateOidcDiscovery(input.sso.issuer);
    }
    const encryptedSecret = effectiveSecret
      ? encryptPlatformSecret(effectiveSecret, config.auth.secret)
      : null;
    await this.db.platformSettingsRecord.upsert({
      where: { id: "platform" },
      create: {
        id: "platform",
        oidcEnabled: input.sso.enabled,
        oidcDisplayName: input.sso.displayName,
        oidcIssuer: input.sso.issuer,
        oidcClientId: input.sso.clientId,
        oidcGroupClaim: input.sso.groupClaim ?? "groups",
        oidcClientSecretEncrypted: encryptedSecret,
        updatedBy: actor,
      },
      update: {
        oidcEnabled: input.sso.enabled,
        oidcDisplayName: input.sso.displayName,
        oidcIssuer: input.sso.issuer,
        oidcClientId: input.sso.clientId,
        oidcGroupClaim: input.sso.groupClaim ?? "groups",
        oidcClientSecretEncrypted: encryptedSecret,
        updatedBy: actor,
        revision: { increment: 1 },
      },
    });
    return this.getSecurity();
  }

  async getSecurity(): Promise<PlatformSecuritySettingsView> {
    const [settings, roleBindings] = await Promise.all([
      this.stored(),
      new ExternalRoleBindingService(this.db).list(),
    ]);
    return this.securityView(settings, roleBindings);
  }

  async runtimeNamespaceDeletionTimeoutSeconds(): Promise<number> {
    return (await this.stored())?.runtimeNamespaceDeletionTimeoutSeconds ?? 120;
  }

  async emailRuntimeSettings(): Promise<PlatformEmailRuntimeSettings> {
    const settings = await this.stored();
    const view = this.emailView(settings);
    if (view.configurationError) throw new Error(view.configurationError);
    const config = getControlConfig();
    return {
      ...view,
      password: settings?.smtpPasswordEncrypted
        ? decryptPlatformSecret(settings.smtpPasswordEncrypted, config.auth.secret)
        : "",
    };
  }

  async updateEmail(
    input: UpdatePlatformEmailSettingsInput,
    actor: string,
  ): Promise<PlatformEmailSettingsView> {
    const current = await this.stored();
    const password = input.password.action === "replace"
      ? input.password.value
      : input.password.action === "clear"
        ? ""
        : this.currentEmailPassword(current);
    if (input.enabled && Boolean(input.username) !== Boolean(password)) {
      throw new Error(
        "SMTP username and password must be configured together when email delivery is enabled.",
      );
    }
    const config = getControlConfig();
    const encryptedPassword = password
      ? encryptPlatformSecret(password, config.auth.secret)
      : null;
    await this.db.platformSettingsRecord.upsert({
      where: { id: "platform" },
      create: {
        id: "platform",
        smtpEnabled: input.enabled,
        smtpHost: input.host,
        smtpPort: input.port,
        smtpSecure: input.secure,
        smtpUsername: input.username,
        smtpPasswordEncrypted: encryptedPassword,
        smtpFromAddress: input.fromAddress,
        smtpFromName: input.fromName,
        smtpReplyTo: input.replyTo,
        updatedBy: actor,
      },
      update: {
        smtpEnabled: input.enabled,
        smtpHost: input.host,
        smtpPort: input.port,
        smtpSecure: input.secure,
        smtpUsername: input.username,
        smtpPasswordEncrypted: encryptedPassword,
        smtpFromAddress: input.fromAddress,
        smtpFromName: input.fromName,
        smtpReplyTo: input.replyTo,
        updatedBy: actor,
        revision: { increment: 1 },
      },
    });
    return this.emailView(await this.stored());
  }

  async validateEmail(
    input: ValidatePlatformEmailSettingsInput,
  ): Promise<PlatformEmailValidationView> {
    const current = await this.stored();
    const password = input.password.action === "replace"
      ? input.password.value
      : input.password.action === "clear"
        ? ""
        : this.currentEmailPassword(current);
    if (Boolean(input.username) !== Boolean(password)) {
      throw new Error(
        "SMTP username and password must be configured together before testing the connection.",
      );
    }
    try {
      await this.smtpVerify({
        host: input.host,
        password,
        port: input.port,
        secure: input.secure,
        username: input.username,
      });
    } catch (error) {
      throw new Error(
        `SMTP connection validation failed: ${
          error instanceof Error ? error.message : "unknown SMTP error"
        }`,
      );
    }
    return {
      authentication: input.username ? "authenticated" : "not_required",
      host: input.host,
      port: input.port,
      secure: input.secure,
      validatedAt: new Date().toISOString(),
    };
  }

  async validateSecurity(
    input: ValidatePlatformSsoSettingsInput,
  ): Promise<PlatformSsoValidationView> {
    const current = await this.stored();
    const effectiveSecret = input.clientSecret.action === "replace"
      ? input.clientSecret.value
      : input.clientSecret.action === "clear"
        ? ""
        : this.currentClientSecret(current);
    if (!effectiveSecret) {
      throw new Error("A Client secret is required to validate SSO.");
    }

    const discovery = await this.readOidcDiscovery(input.issuer);
    let response: Response;
    try {
      response = await this.oidcFetch(discovery.jwksUri, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(5_000),
      });
    } catch (error) {
      throw new Error(
        `OIDC JWKS is unavailable: ${error instanceof Error ? error.message : "connection failed"}`,
      );
    }
    if (!response.ok) {
      throw new Error(`OIDC JWKS returned HTTP ${response.status}.`);
    }
    let jwks: Record<string, unknown>;
    try {
      jwks = await response.json() as Record<string, unknown>;
    } catch {
      throw new Error("OIDC JWKS did not return a valid JSON document.");
    }
    if (!Array.isArray(jwks.keys) || jwks.keys.length === 0) {
      throw new Error("OIDC JWKS does not contain any signing keys.");
    }

    return {
      ...discovery,
      signingKeyCount: jwks.keys.length,
      validatedAt: new Date().toISOString(),
    };
  }

  private currentClientSecret(
    settings: Awaited<ReturnType<PlatformSettingsService["stored"]>>,
  ): string {
    const config = getControlConfig();
    return settings?.oidcClientSecretEncrypted
      ? decryptPlatformSecret(settings.oidcClientSecretEncrypted, config.auth.secret)
      : "";
  }

  private currentEmailPassword(
    settings: Awaited<ReturnType<PlatformSettingsService["stored"]>>,
  ): string {
    const config = getControlConfig();
    return settings?.smtpPasswordEncrypted
      ? decryptPlatformSecret(settings.smtpPasswordEncrypted, config.auth.secret)
      : "";
  }

  private securityView(
    settings: Awaited<ReturnType<PlatformSettingsService["stored"]>>,
    roleBindings: ExternalRoleBindingView[] = [],
  ): PlatformSecuritySettingsView {
    const config = getControlConfig();
    const publicUrl = config.server.public_url?.replace(/\/$/, "") ?? "";
    let configurationError: string | null = null;
    let clientSecretConfigured = Boolean(settings?.oidcClientSecretEncrypted);
    if (settings?.oidcClientSecretEncrypted) {
      try {
        clientSecretConfigured = Boolean(decryptPlatformSecret(
          settings.oidcClientSecretEncrypted,
          config.auth.secret,
        ));
      } catch (error) {
        clientSecretConfigured = true;
        configurationError = error instanceof Error
          ? error.message
          : "The stored Platform secret is unavailable.";
      }
    }
    return {
      canEditOnline: config.auth.local.enabled,
      configurationError,
      localAuthenticationEnabled: config.auth.local.enabled,
      sso: {
        callbackUrl: `${publicUrl}/api/auth/callback/corporate-sso`,
        clientId: settings?.oidcClientId ?? "",
        clientSecretConfigured,
        displayName: settings?.oidcDisplayName ?? "SSO",
        enabled: settings?.oidcEnabled ?? false,
        groupClaim: settings?.oidcGroupClaim ?? "groups",
        issuer: settings?.oidcIssuer ?? "",
        roleBindings,
      },
    };
  }

  private emailView(
    settings: Awaited<ReturnType<PlatformSettingsService["stored"]>>,
  ): PlatformEmailSettingsView {
    const config = getControlConfig();
    let configurationError: string | null = null;
    let passwordConfigured = Boolean(settings?.smtpPasswordEncrypted);
    if (settings?.smtpPasswordEncrypted) {
      try {
        passwordConfigured = Boolean(decryptPlatformSecret(
          settings.smtpPasswordEncrypted,
          config.auth.secret,
        ));
      } catch (error) {
        passwordConfigured = true;
        configurationError = error instanceof Error
          ? error.message
          : "The stored SMTP password is unavailable.";
      }
    }
    return {
      configurationError,
      enabled: settings?.smtpEnabled ?? false,
      fromAddress: settings?.smtpFromAddress ?? "",
      fromName: settings?.smtpFromName ?? "TaskLattice Relay",
      host: settings?.smtpHost ?? "",
      passwordConfigured,
      port: settings?.smtpPort ?? 587,
      replyTo: settings?.smtpReplyTo ?? "",
      secure: settings?.smtpSecure ?? false,
      username: settings?.smtpUsername ?? "",
    };
  }

  private async validateOidcDiscovery(issuer: string): Promise<void> {
    await this.readOidcDiscovery(issuer);
  }

  private async readOidcDiscovery(issuer: string): Promise<OidcDiscoveryDocument> {
    const discoveryUrl = `${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`;
    let response: Response;
    try {
      response = await this.oidcFetch(discoveryUrl, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(5_000),
      });
    } catch (error) {
      throw new Error(
        `OIDC discovery is unavailable: ${error instanceof Error ? error.message : "connection failed"}`,
      );
    }
    if (!response.ok) {
      throw new Error(`OIDC discovery returned HTTP ${response.status}.`);
    }
    let document: Record<string, unknown>;
    try {
      document = await response.json() as Record<string, unknown>;
    } catch {
      throw new Error("OIDC discovery did not return a valid JSON document.");
    }
    for (const field of [
      "issuer",
      "authorization_endpoint",
      "token_endpoint",
      "jwks_uri",
    ] as const) {
      if (!normalizedHttpUrl(document[field])) {
        throw new Error(`OIDC discovery does not provide a valid ${field}.`);
      }
    }
    if (normalizedHttpUrl(document.issuer) !== normalizedHttpUrl(issuer)) {
      throw new Error("OIDC discovery issuer does not match the configured issuer.");
    }
    return {
      authorizationEndpoint: normalizedHttpUrl(document.authorization_endpoint)!,
      discoveryUrl,
      issuer: normalizedHttpUrl(document.issuer)!,
      jwksUri: normalizedHttpUrl(document.jwks_uri)!,
      tokenEndpoint: normalizedHttpUrl(document.token_endpoint)!,
    };
  }
}
