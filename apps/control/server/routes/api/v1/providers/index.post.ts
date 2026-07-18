import { createProviderConnectionSchema } from "@tasklattice/contracts";
import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../http/responses";
import { getProviderService } from "../../../../services";

export default defineHandler(async (event) => {
  try {
    requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    const input = createProviderConnectionSchema.parse(await event.req.json());
    const result = await (await getProviderService()).createConnection(input);
    return jsonResponse(result, {
      status: 201,
      headers: { location: `/api/v1/providers/${result.account.id}` },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
