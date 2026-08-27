import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../../http/responses";
import { getProjectStore } from "../../../../../../../services";

export default defineHandler(async (event) => {
  let auth;
  try { auth = await requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    const routing = await (await getProjectStore(event.req)).inheritDepartmentRouting(
      decodeURIComponent(event.context.params?.routingId ?? ""),
      auth.user.id,
    );
    return jsonResponse(routing, { status: 201 });
  } catch (error) { return errorResponse(error); }
});
