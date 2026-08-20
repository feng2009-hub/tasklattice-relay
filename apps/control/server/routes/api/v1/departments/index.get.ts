import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../auth/auth";
import { DepartmentService } from "../../../../departments/department-service";
import { errorResponse, jsonResponse } from "../../../../http/responses";

export default defineHandler(async (event) => {
  let auth;
  try {
    auth = await requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    return jsonResponse(await new DepartmentService().list(auth));
  } catch (error) {
    return errorResponse(error);
  }
});
