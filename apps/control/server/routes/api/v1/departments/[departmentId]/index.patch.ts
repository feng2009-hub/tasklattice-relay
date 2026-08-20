import { defineHandler } from "nitro";
import { updateDepartmentInputSchema } from "../../../../../api-contracts/schemas";
import { requireAuth, unauthorizedResponse } from "../../../../../auth/auth";
import { DepartmentService } from "../../../../../departments/department-service";
import { errorResponse, jsonResponse } from "../../../../../http/responses";

export default defineHandler(async (event) => {
  let auth;
  try {
    auth = await requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    const input = updateDepartmentInputSchema.parse(await event.req.json());
    return jsonResponse(
      await new DepartmentService().update(
        auth,
        event.context.params?.departmentId ?? "",
        input,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
});
