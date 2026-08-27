import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../../../../../auth/auth";
import { errorResponse, jsonResponse, problemResponse } from "../../../../../../../../../../http/responses";
import { getResourceCatalogService, requireProjectRole } from "../../../../../../../../../../services";

export default defineHandler(async (event) => {
  try { await requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    await requireProjectRole(event.req, ["admin"]);
    const databaseId = decodeURIComponent(event.context.params?.id ?? "");
    const documentId = decodeURIComponent(event.context.params?.documentId ?? "");
    const deleted = await (await getResourceCatalogService(event.req))
      .deleteVectorDocument(databaseId, documentId);
    if (!deleted) return problemResponse(404, "Vector Document was not found.");
    return jsonResponse({ message: "Vector Document deleted." });
  } catch (error) {
    return errorResponse(error);
  }
});
