import { defineHandler } from "nitro";
import {
  requireAuth,
  requirePlatformAdministrator,
  unauthorizedResponse,
} from "../../../../../auth/auth";
import { RoleCatalogService } from "../../../../../authorization/role-catalog";
import { errorResponse, jsonResponse } from "../../../../../http/responses";

export default defineHandler(async (event) => {
  try {
    await requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    await requirePlatformAdministrator(event.req, "CAP_PLATFORM_ROLE_VIEW");
    return jsonResponse(await new RoleCatalogService().catalog());
  } catch (error) {
    return errorResponse(error);
  }
});
