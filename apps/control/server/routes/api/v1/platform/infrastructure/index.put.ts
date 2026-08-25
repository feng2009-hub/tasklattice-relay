import { updatePlatformInfrastructureSettingsSchema } from "@tali/contracts";
import { defineHandler } from "nitro";
import {
  requireAuth,
  requirePlatformAdministrator,
  unauthorizedResponse,
} from "../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../http/responses";
import { PlatformSettingsService } from "../../../../../platform/platform-settings-service";

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
    const input = updatePlatformInfrastructureSettingsSchema.parse(
      await event.req.json(),
    );
    return jsonResponse(
      await new PlatformSettingsService().updateInfrastructure(
        input,
        principal.user.username,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
});
