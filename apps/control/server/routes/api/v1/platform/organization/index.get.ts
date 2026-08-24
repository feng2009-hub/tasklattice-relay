import { defineHandler } from "nitro";
import {
  requireAuth,
  requirePlatformAdministrator,
  unauthorizedResponse,
} from "../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../http/responses";
import { PlatformOrganizationService } from "../../../../../platform/platform-organization-service";

export default defineHandler(async (event) => {
  try {
    await requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    await requirePlatformAdministrator(event.req);
    return jsonResponse(await new PlatformOrganizationService().get());
  } catch (error) {
    return errorResponse(error);
  }
});
