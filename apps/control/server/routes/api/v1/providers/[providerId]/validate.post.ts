import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../http/responses";
import { getProviderService } from "../../../../../services";

export default defineHandler(async (event) => {
  try {
    requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    const providerId = event.context.params?.providerId;
    if (!providerId)
      return jsonResponse(
        { error: "Provider connection id is required." },
        { status: 400 },
      );
    const connection = await (
      await getProviderService()
    ).revalidateAccount(providerId);
    if (!connection)
      return jsonResponse(
        { error: "Provider connection not found." },
        { status: 404 },
      );
    return jsonResponse(connection);
  } catch (error) {
    return errorResponse(error);
  }
});
