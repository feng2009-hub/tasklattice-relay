import {
  createKnowledgeSourceDefinitionSchema,
  createMcpServerDefinitionSchema,
  createSkillDefinitionSchema,
  extensionResourceKindSchema,
} from "@tasklattice/contracts";
import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../http/responses";
import { getExtensionCatalogService, requireWorkspaceRole } from "../../../../../services";

export default defineHandler(async (event) => {
  try { requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    await requireWorkspaceRole(event.req, ["owner", "admin"]);
    const kind = extensionResourceKindSchema.parse(event.context.params?.kind);
    const body = await event.req.json();
    const service = await getExtensionCatalogService(event.req);
    const created = await (kind === "skills"
      ? service.createSkill(createSkillDefinitionSchema.parse(body))
      : kind === "mcp-servers"
        ? service.createMcpServer(createMcpServerDefinitionSchema.parse(body))
        : service.createKnowledgeSource(createKnowledgeSourceDefinitionSchema.parse(body)));
    return jsonResponse(created, {
      status: 201,
      headers: { location: `/api/v1/extensions/${kind}/${created.id}` },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
