import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../../http/responses";
import { getProjectStore } from "../../../../../../../services";

export default defineHandler(async (event) => {
  try { await requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    await (await getProjectStore(event.req)).removeDepartmentRoutingInheritance(
      decodeURIComponent(event.context.params?.routingId ?? ""),
    );
    return jsonResponse({ message: "Routing inheritance removed." });
  } catch (error) { return errorResponse(error); }
});
