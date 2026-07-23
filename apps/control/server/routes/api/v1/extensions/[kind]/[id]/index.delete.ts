import { extensionResourceKindSchema } from "@tasklattice/contracts";
import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../http/responses";
import { getExtensionCatalogService, requireWorkspaceRole } from "../../../../../../services";

export default defineHandler(async (event) => {
  try { requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    await requireWorkspaceRole(event.req, ["owner", "admin"]);
    const kind = extensionResourceKindSchema.parse(event.context.params?.kind);
    const id = decodeURIComponent(event.context.params?.id ?? "");
    const deleted = await (await getExtensionCatalogService(event.req)).delete(kind, id);
    if (!deleted) return jsonResponse({ error: "Extension was not found." }, { status: 404 });
    return jsonResponse({ message: "Extension deleted." });
  } catch (error) {
    return errorResponse(error);
  }
});
