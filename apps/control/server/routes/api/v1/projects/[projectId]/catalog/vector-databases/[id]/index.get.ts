import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../../../http/responses";
import { getResourceCatalogService, requireProjectRole } from "../../../../../../../../services";

export default defineHandler(async (event) => {
  try { await requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    await requireProjectRole(event.req, ["admin", "auditor", "developer"]);
    const id = decodeURIComponent(event.context.params?.id ?? "");
    return jsonResponse(
      await (await getResourceCatalogService(event.req)).vectorDatabaseOverview(id),
    );
  } catch (error) {
    return errorResponse(error);
  }
});
