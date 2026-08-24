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
    await requirePlatformAdministrator(event.req, "CAP_PLATFORM_SETTINGS_VIEW");
    const health = await new NemoClawRunnerClient().getHealth().catch(() => undefined);
    return jsonResponse(await new PlatformSettingsService().get(health));
  } catch (error) {
    return errorResponse(error);
  }
});
