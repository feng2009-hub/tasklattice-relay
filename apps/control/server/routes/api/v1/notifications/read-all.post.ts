import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../http/responses";
import { NotificationService } from "../../../../notifications/notification-service";

export default defineHandler(async (event) => {
  let auth;
  try {
    auth = await requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    return jsonResponse(await new NotificationService().markAllRead(auth));
  } catch (error) {
    return errorResponse(error);
  }
});
