import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PlatformPrincipal } from "../auth/auth";
import { createTestPrisma } from "../test/prisma";
import { PersonalProfileService } from "./personal-profile-service";

function auth(): PlatformPrincipal {
  return {
    user: {
      displayName: "Local Administrator",
      email: "admin@tali.local",
      id: "local-admin",
      hasPassword: true,
      systemRole: "super_administrator",
      username: "admin",
    },
  };
}

describe("PersonalProfileService", () => {
  const db = createTestPrisma();
  const service = new PersonalProfileService(db);

  beforeEach(async () => {
    await db.user.update({
      where: { id: "local-admin" },
      data: { language: "en-US", theme: "system", timezone: "UTC" },
    });
  });

  afterEach(async () => {
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
});
