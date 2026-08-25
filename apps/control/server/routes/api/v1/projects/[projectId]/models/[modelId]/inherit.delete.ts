import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../../http/responses";
import { getProjectStore } from "../../../../../../../services";

export default defineHandler(async (event) => {
  try { await requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    await (await getProjectStore(event.req)).removeDepartmentModelInheritance(
      decodeURIComponent(event.context.params?.modelId ?? ""),
    );
    return jsonResponse({ message: "Model inheritance removed." });
  } catch (error) { return errorResponse(error); }
});
