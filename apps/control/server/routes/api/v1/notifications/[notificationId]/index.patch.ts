import { defineHandler } from "nitro";
import { z } from "zod";
import { requireAuth, unauthorizedResponse } from "../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../http/responses";
import { NotificationService } from "../../../../../notifications/notification-service";

const inputSchema = z.object({ read: z.boolean() });

export default defineHandler(async (event) => {
  let auth;
  try {
    auth = requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    const notificationId = z.string().uuid().parse(
      event.context.params?.notificationId,
    );
    const input = inputSchema.parse(await event.req.json());
    return jsonResponse(
      await new NotificationService().setRead(
        auth,
        notificationId,
        input.read,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
});
