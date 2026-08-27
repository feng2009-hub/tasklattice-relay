import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../../http/responses";
import { getProjectStore } from "../../../../../../../services";

export default defineHandler(async (event) => {
  let auth;
  try { auth = await requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    const model = await (await getProjectStore(event.req)).inheritDepartmentModel(
      decodeURIComponent(event.context.params?.modelId ?? ""),
      auth.user.id,
    );
    return jsonResponse(model, { status: 201 });
  } catch (error) { return errorResponse(error); }
});
