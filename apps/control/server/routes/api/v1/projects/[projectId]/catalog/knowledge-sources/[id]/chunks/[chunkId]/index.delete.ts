import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../../../../../auth/auth";
import { errorResponse, jsonResponse, problemResponse } from "../../../../../../../../../../http/responses";
import { getResourceCatalogService, requireProjectRole } from "../../../../../../../../../../services";

export default defineHandler(async (event) => {
  try { await requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    await requireProjectRole(event.req, ["admin"]);
    const sourceId = decodeURIComponent(event.context.params?.id ?? "");
    const chunkId = decodeURIComponent(event.context.params?.chunkId ?? "");
    const deleted = await (await getResourceCatalogService(event.req))
      .deleteKnowledgeVectorChunk(sourceId, chunkId);
    if (!deleted) return problemResponse(404, "Knowledge vector chunk was not found.");
    return jsonResponse({ message: "Knowledge vector chunk deleted." });
  } catch (error) {
    return errorResponse(error);
  }
});
