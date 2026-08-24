import { platformPeopleQuerySchema } from "@tali/contracts";
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
    await requirePlatformAdministrator(event.req, "CAP_PLATFORM_PEOPLE_VIEW");
    const searchParams = Object.fromEntries(new URL(event.req.url).searchParams);
    const query = platformPeopleQuerySchema.parse(searchParams);
    return jsonResponse(await new PlatformOrganizationService().listPeople(query));
  } catch (error) {
    return errorResponse(error);
  }
});
