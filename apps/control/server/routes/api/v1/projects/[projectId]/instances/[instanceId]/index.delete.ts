import { defineHandler } from "nitro";
import { instanceParamsSchema } from "../../../../../../../api-contracts/schemas";
import { requireAuth, unauthorizedResponse } from "../../../../../../../auth/auth";
import { errorResponse, jsonResponse, problemResponse } from "../../../../../../../http/responses";
import { getInstanceService } from "../../../../../../../services";

export default defineHandler(async (event) => {
  try {
    await requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    const { instanceId: id } = instanceParamsSchema.parse(event.context.params);
    const destroyed = await (await getInstanceService(event.req)).destroy(id);
    return destroyed
      ? jsonResponse(
          { id, status: "DESTROYING", accepted: true },
          { status: 202 },
        )
      : problemResponse(404, "Instance not found.");
  } catch (error) {
    return errorResponse(error);
  }
});
