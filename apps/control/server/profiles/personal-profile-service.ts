import type { PrismaClient } from "../generated/prisma/client";
import type { SystemRole } from "../auth/auth";
import type { PlatformPrincipal } from "../auth/auth";
import {
  corporateSsoProviderId,
  groupsFromVerifiedIdToken,
} from "../auth/external-role-bindings";
import { prisma } from "../db/prisma";
import { ProjectService } from "../projects/project-service";

export interface PersonalSsoIdentity {
  groupClaim: string;
  groupClaimError: string | null;
  groups: string[];
  issuer: string;
  providerId: string;
  providerName: string;
  scopes: string[];
  subject: string;
  synchronizedAt: string;
}

export interface PersonalProfile {
  displayName: string;
  email: string;
  language: "en-US" | "zh-CN" | "zh-TW";
  hasPassword: boolean;
  ssoIdentity: PersonalSsoIdentity | null;
  systemRole: SystemRole;
  theme: "system" | "light" | "dark";
  timezone: string;
  username: string;
}

export class PersonalProfileService {
  constructor(private readonly db: PrismaClient = prisma()) {}

  async get(auth: PlatformPrincipal): Promise<PersonalProfile> {
    await new ProjectService(this.db).requireUser(auth);
    const user = await this.db.user.findUnique({
      where: { id: auth.user.id },
    });
    if (!user) throw new Error("Personal profile not found.");
    const [ssoAccount, platformSettings] = await Promise.all([
      this.db.authAccount.findFirst({
        where: {
          providerId: corporateSsoProviderId,
          userId: user.id,
        },
        orderBy: { updatedAt: "desc" },
        select: {
          accountId: true,
          idToken: true,
          issuer: true,
          providerId: true,
          scope: true,
          updatedAt: true,
        },
      }),
      this.db.platformSettingsRecord.findUnique({
        where: { id: "platform" },
        select: {
          oidcDisplayName: true,
          oidcGroupClaim: true,
        },
      }),
    ]);
    const groupClaim = platformSettings?.oidcGroupClaim || "groups";
    let groups: string[] = [];
    let groupClaimError: string | null = null;
    if (ssoAccount?.idToken) {
      try {
        groups = groupsFromVerifiedIdToken(ssoAccount.idToken, groupClaim);
      } catch (error) {
        groupClaimError = error instanceof Error
          ? error.message
          : `Unable to read the ${groupClaim} claim.`;
      }
    } else if (ssoAccount) {
      groupClaimError = "The current SSO account has no stored ID token.";
    }
    return {
      displayName: user.displayName,
      email: user.email,
      language:
        user.language === "zh-CN" || user.language === "zh-TW"
          ? user.language
          : "en-US",
      hasPassword: auth.user.hasPassword,
      ssoIdentity: ssoAccount
        ? {
            groupClaim,
            groupClaimError,
            groups,
            issuer: ssoAccount.issuer,
            providerId: ssoAccount.providerId,
            providerName: platformSettings?.oidcDisplayName || "SSO",
            scopes: (ssoAccount.scope ?? "")
              .split(/\s+/)
              .filter(Boolean),
            subject: ssoAccount.accountId,
            synchronizedAt: ssoAccount.updatedAt.toISOString(),
          }
        : null,
      systemRole: user.systemRole,
      theme:
        user.theme === "light" || user.theme === "dark" ? user.theme : "system",
      timezone: user.timezone || "UTC",
      username: user.username ?? user.email,
    };
  }

  async update(
    auth: PlatformPrincipal,
    input: {
      language: "en-US" | "zh-CN" | "zh-TW";
      theme: "system" | "light" | "dark";
      timezone: string;
    },
  ): Promise<PersonalProfile> {
    await new ProjectService(this.db).requireUser(auth);
    await this.db.user.update({
      where: { id: auth.user.id },
      data: {
        language: input.language,
        theme: input.theme,
        timezone: input.timezone,
      },
    });
    return this.get(auth);
  }

}
