import {
  extensionResourceKindSchema,
  updateKnowledgeSourceDefinitionSchema,
  updateMcpServerDefinitionSchema,
  updateSkillDefinitionSchema,
} from "@tasklattice/contracts";
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
    const body = await event.req.json();
    const service = await getExtensionCatalogService(event.req);
    const updated = await (kind === "skills"
      ? service.updateSkill(id, updateSkillDefinitionSchema.parse(body))
      : kind === "mcp-servers"
        ? service.updateMcpServer(id, updateMcpServerDefinitionSchema.parse(body))
        : service.updateKnowledgeSource(id, updateKnowledgeSourceDefinitionSchema.parse(body)));
    return jsonResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
});
