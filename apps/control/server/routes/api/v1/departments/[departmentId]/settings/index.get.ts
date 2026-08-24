import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../auth/auth";
import { DepartmentSettingsService } from "../../../../../../departments/department-settings-service";
import { errorResponse, jsonResponse } from "../../../../../../http/responses";

export default defineHandler(async (event) => {
  let auth;
  try {
    auth = await requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    return jsonResponse(
      await new DepartmentSettingsService().get(
        auth,
        event.context.params?.departmentId ?? "",
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
});
