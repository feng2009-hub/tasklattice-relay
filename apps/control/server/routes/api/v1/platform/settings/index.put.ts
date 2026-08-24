import { updatePlatformSettingsSchema } from "@tali/contracts";
import { defineHandler } from "nitro";
import {
  requireAuth,
  requirePlatformAdministrator,
  unauthorizedResponse,
} from "../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../http/responses";
import { PlatformSettingsService } from "../../../../../platform/platform-settings-service";
import { NemoClawRunnerClient } from "../../../../../runtime/nemoclaw-runner-client";

export default defineHandler(async (event) => {
  try {
    await requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    const principal = await requirePlatformAdministrator(
      event.req,
      "CAP_PLATFORM_SETTINGS_UPDATE",
    );
    const input = updatePlatformSettingsSchema.parse(await event.req.json());
    const health = await new NemoClawRunnerClient().getHealth().catch(() => undefined);
    return jsonResponse(
      await new PlatformSettingsService().update(
        input,
        principal.user.username,
        health,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
});
