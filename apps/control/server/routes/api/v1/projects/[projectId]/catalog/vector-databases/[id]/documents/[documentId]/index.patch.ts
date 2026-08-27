import { updateVectorDocumentSchema } from "@tali/contracts";
import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../../../../../http/responses";
import { getResourceCatalogService, requireProjectRole } from "../../../../../../../../../../services";

export default defineHandler(async (event) => {
  try { await requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    await requireProjectRole(event.req, ["admin"]);
    const databaseId = decodeURIComponent(event.context.params?.id ?? "");
    const documentId = decodeURIComponent(event.context.params?.documentId ?? "");
    const input = updateVectorDocumentSchema.parse(await event.req.json());
    return jsonResponse(
      await (await getResourceCatalogService(event.req)).updateVectorDocument(databaseId, documentId, input),
    );
  } catch (error) {
    return errorResponse(error);
  }
});
