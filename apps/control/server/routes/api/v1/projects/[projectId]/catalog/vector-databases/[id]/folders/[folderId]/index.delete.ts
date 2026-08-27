import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../../../../../auth/auth";
import { errorResponse, jsonResponse, problemResponse } from "../../../../../../../../../../http/responses";
import { getResourceCatalogService, requireProjectRole } from "../../../../../../../../../../services";

export default defineHandler(async (event) => {
  try { await requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    await requireProjectRole(event.req, ["admin"]);
    const databaseId = decodeURIComponent(event.context.params?.id ?? "");
    const folderId = decodeURIComponent(event.context.params?.folderId ?? "");
    const impact = await (await getResourceCatalogService(event.req))
      .deleteVectorFolder(databaseId, folderId);
    if (!impact) return problemResponse(404, "Vector Folder was not found.");
    return jsonResponse(impact);
  } catch (error) {
    return errorResponse(error);
  }
});
