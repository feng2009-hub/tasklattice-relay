import { defineHandler } from "nitro";
import { z } from "zod";
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
    const providerId = z.string().uuid().parse(event.context.params?.providerId);
    const deleted = await (await getProviderService()).deleteAccount(providerId);
    return deleted
      ? jsonResponse({ message: "Provider Account deleted." })
      : jsonResponse({ error: "Provider Account not found." }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
});
