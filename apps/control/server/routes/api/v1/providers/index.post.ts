import { createProviderAccountSchema } from "@tasklattice/contracts";
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
    const input = createProviderAccountSchema.parse(await event.req.json());
    const account = await (await getProviderService()).registerAccount(input);
    return jsonResponse(account, {
      status: 201,
      headers: { location: `/api/v1/providers/${account.id}` },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
