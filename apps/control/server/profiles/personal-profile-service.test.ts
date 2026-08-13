import { afterEach, beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import type { AuthPayload } from "../auth/auth";
import { createTestPrisma } from "../test/prisma";
import { PersonalProfileService } from "./personal-profile-service";

function auth(): AuthPayload {
  return {
    exp: Number.MAX_SAFE_INTEGER,
    iat: 0,
    iss: "tali",
    sub: "local-admin",
    user: {
      displayName: "Local Administrator",
      email: "admin@tali.local",
      id: "local-admin",
      provider: "local",
      systemRole: "super_administrator",
      username: "admin",
    },
  };
}

describe("PersonalProfileService", () => {
  const db = createTestPrisma();
  const service = new PersonalProfileService(db);

  beforeEach(async () => {
    await db.localCredential.upsert({
      where: { identityId: "identity-local-admin" },
      create: {
        identityId: "identity-local-admin",
        passwordHash: await bcrypt.hash("current-password", 4),
      },
      update: {
        passwordHash: await bcrypt.hash("current-password", 4),
      },
    });
    await db.user.update({
      where: { id: "local-admin" },
      data: { language: "en-US", theme: "system", timezone: "UTC" },
    });
  });

  afterEach(async () => {
    await db.localCredential.deleteMany({
      where: { identityId: "identity-local-admin" },
    });
    await db.user.update({
      where: { id: "local-admin" },
      data: { language: "en-US", theme: "system", timezone: "UTC" },
    });
  });

  it("stores personal preferences on the user", async () => {
    await expect(
      service.update(auth(), {
        language: "zh-CN",
        theme: "dark",
        timezone: "Asia/Shanghai",
      }),
    ).resolves.toMatchObject({
      displayName: "Local Administrator",
      language: "zh-CN",
      theme: "dark",
      timezone: "Asia/Shanghai",
      username: "admin",
    });
    await expect(service.get(auth())).resolves.not.toHaveProperty("city");
  });

  it("resets a local password using only the database hash", async () => {
    await service.resetPassword(auth(), {
      currentPassword: "current-password",
      newPassword: "new-password-value",
    });
    const credential = await db.localCredential.findUniqueOrThrow({
      where: { identityId: "identity-local-admin" },
    });
    await expect(
      bcrypt.compare("new-password-value", credential.passwordHash),
    ).resolves.toBe(true);
    await expect(
      bcrypt.compare("current-password", credential.passwordHash),
    ).resolves.toBe(false);
  });

  it("rejects an incorrect current password", async () => {
    await expect(
      service.resetPassword(auth(), {
        currentPassword: "incorrect-password",
        newPassword: "new-password-value",
      }),
    ).rejects.toThrow("Invalid current password.");
  });
});
