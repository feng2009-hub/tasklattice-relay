import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../../auth/auth";
import { errorResponse, jsonResponse, problemResponse } from "../../../../../../../http/responses";
import { getModelRoutingService } from "../../../../../../../services";

export default defineHandler(async (event) => {
  try { await requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    const routing = await (await getModelRoutingService(event.req)).get(decodeURIComponent(event.context.params?.routingId ?? ""));
    return routing ? jsonResponse(routing) : problemResponse(404, "Model routing not found.");
  } catch (error) { return errorResponse(error); }
});
