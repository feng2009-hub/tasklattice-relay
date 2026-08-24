import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PlatformPrincipal } from "../auth/auth";
import { createTestPrisma } from "../test/prisma";
import { PersonalProfileService } from "./personal-profile-service";

function idToken(payload: Record<string, unknown>): string {
  return [
    Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "signature",
  ].join(".");
}

function auth(): PlatformPrincipal {
  return {
    user: {
      displayName: "Local Administrator",
      email: "admin@tali.local",
      id: "local-admin",
      hasPassword: true,
      systemRole: "platform_administrator",
      username: "admin",
    },
  };
}

describe("PersonalProfileService", () => {
  const db = createTestPrisma();
  const service = new PersonalProfileService(db);

  beforeEach(async () => {
    await db.authAccount.deleteMany({
      where: { providerId: "corporate-sso", userId: "local-admin" },
    });
    await db.user.update({
      where: { id: "local-admin" },
      data: { language: "en-US", theme: "system", timezone: "UTC" },
    });
  });

  afterEach(async () => {
    await db.authAccount.deleteMany({
      where: { providerId: "corporate-sso", userId: "local-admin" },
    });
    await db.user.update({
      where: { id: "local-admin" },
      data: { language: "en-US", theme: "system", timezone: "UTC" },
    });
  });

  it("stores personal preferences on the user", async () => {
    await expect(
      service.update(auth(), {
        language: "zh-TW",
        theme: "dark",
        timezone: "Asia/Taipei",
      }),
    ).resolves.toMatchObject({
      displayName: "Local Administrator",
      language: "zh-TW",
      theme: "dark",
      timezone: "Asia/Taipei",
      username: "admin",
    });
    await expect(service.get(auth())).resolves.not.toHaveProperty("city");
  });

  it("returns safe SSO identity diagnostics without exposing tokens", async () => {
    await db.platformSettingsRecord.upsert({
      where: { id: "platform" },
      create: {
        id: "platform",
        oidcDisplayName: "Keycloak SSO",
        oidcGroupClaim: "groups",
      },
      update: {
        oidcDisplayName: "Keycloak SSO",
        oidcGroupClaim: "groups",
      },
    });
    await db.authAccount.create({
      data: {
        accountId: "keycloak-user-42",
        id: "profile-test-sso-account",
        idToken: idToken({
          groups: [
            "/tali/d/dep1/p/proj1/r/ROLE_PROJECT_ADMIN",
            "/tali/d/dep1/p/proj1/r/ROLE_AGENT_DEVELOPER",
          ],
          sub: "keycloak-user-42",
        }),
        issuer: "http://keycloak.example/realms/tali",
        providerId: "corporate-sso",
        scope: "openid profile email groups",
        userId: "local-admin",
      },
    });
    const ssoAuth = auth();
    ssoAuth.user.hasPassword = false;

    const profile = await service.get(ssoAuth);

    expect(profile.ssoIdentity).toMatchObject({
      groupClaim: "groups",
      groupClaimError: null,
      groups: [
        "/tali/d/dep1/p/proj1/r/ROLE_PROJECT_ADMIN",
        "/tali/d/dep1/p/proj1/r/ROLE_AGENT_DEVELOPER",
      ],
      issuer: "http://keycloak.example/realms/tali",
      providerId: "corporate-sso",
      providerName: "Keycloak SSO",
      scopes: ["openid", "profile", "email", "groups"],
      subject: "keycloak-user-42",
    });
    expect(profile.ssoIdentity).not.toHaveProperty("idToken");
    expect(profile.ssoIdentity).not.toHaveProperty("accessToken");
  });
});
