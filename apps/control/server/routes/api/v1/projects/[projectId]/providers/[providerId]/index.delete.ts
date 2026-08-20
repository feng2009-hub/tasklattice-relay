import { defineHandler } from "nitro";
import { providerParamsSchema } from "../../../../../../../api-contracts/schemas";
import { requireAuth, unauthorizedResponse } from "../../../../../../../auth/auth";
import { errorResponse, jsonResponse, problemResponse } from "../../../../../../../http/responses";
import { getProviderService, requireProjectRole } from "../../../../../../../services";

export default defineHandler(async (event) => {
  try {
    await requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    await requireProjectRole(event.req, ["admin"]);
    const { providerId } = providerParamsSchema.parse(event.context.params);
    const deleted = await (await getProviderService(event.req)).deleteAccount(providerId);
    return deleted
      ? jsonResponse({ message: "Provider Account deleted." })
      : problemResponse(404, "Provider Account not found.");
  } catch (error) {
    return errorResponse(error);
  }
});
