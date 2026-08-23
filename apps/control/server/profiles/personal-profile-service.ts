import type { PrismaClient } from "../generated/prisma/client";
import type { SystemRole } from "../auth/auth";
import type { PlatformPrincipal } from "../auth/auth";
import { prisma } from "../db/prisma";
import { ProjectService } from "../projects/project-service";

export interface PersonalProfile {
  displayName: string;
  email: string;
  language: "en-US" | "zh-CN" | "zh-TW";
  hasPassword: boolean;
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
    return {
      displayName: user.displayName,
      email: user.email,
      language:
        user.language === "zh-CN" || user.language === "zh-TW"
          ? user.language
          : "en-US",
      hasPassword: auth.user.hasPassword,
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
