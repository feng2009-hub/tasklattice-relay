import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../auth/auth";
import { notificationInputSchema, notificationParamsSchema } from "../../../../../api-contracts/schemas";
import { errorResponse, jsonResponse } from "../../../../../http/responses";
import { NotificationService } from "../../../../../notifications/notification-service";

export default defineHandler(async (event) => {
  let auth;
  try {
    auth = await requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    const { notificationId } = notificationParamsSchema.parse(event.context.params);
    const input = notificationInputSchema.parse(await event.req.json());
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
