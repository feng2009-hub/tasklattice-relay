import { resourceKindSchema } from "@tali/contracts";
import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../../../auth/auth";
import { errorResponse, jsonResponse, problemResponse } from "../../../../../../../../http/responses";
import { getResourceCatalogService, requireProjectRole } from "../../../../../../../../services";

export default defineHandler(async (event) => {
  try { await requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    await requireProjectRole(event.req, ["admin"]);
    const kind = resourceKindSchema.parse(event.context.params?.kind);
    const id = decodeURIComponent(event.context.params?.id ?? "");
    const deleted = await (await getResourceCatalogService(event.req)).delete(kind, id);
    if (!deleted) return problemResponse(404, "Resource was not found.");
    return jsonResponse({ message: "Resource deleted." });
  } catch (error) {
    return errorResponse(error);
  }
});
