import { createPlatformDepartmentSchema } from "@tali/contracts";
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
    const principal = await requirePlatformAdministrator(
      event.req,
      "CAP_PLATFORM_DEPARTMENT_CREATE",
    );
    const input = createPlatformDepartmentSchema.parse(await event.req.json());
    return jsonResponse(
      await new PlatformOrganizationService().createDepartment(
        input,
        principal.user.id,
      ),
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
});
