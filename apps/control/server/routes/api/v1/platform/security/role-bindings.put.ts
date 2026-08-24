import { replaceExternalRoleBindingsSchema } from "@tali/contracts";
import { defineHandler } from "nitro";
import {
  requireAuth,
  requirePlatformAdministrator,
  unauthorizedResponse,
} from "../../../../../auth/auth";
import { ExternalRoleBindingService } from "../../../../../auth/external-role-bindings";
import { errorResponse, jsonResponse } from "../../../../../http/responses";

export default defineHandler(async (event) => {
  try {
    await requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    const principal = await requirePlatformAdministrator(
      event.req,
      "CAP_PLATFORM_SECURITY_UPDATE",
    );
    const input = replaceExternalRoleBindingsSchema.parse(await event.req.json());
    return jsonResponse(
      await new ExternalRoleBindingService().replace(
        input,
        principal.user.username,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
});
