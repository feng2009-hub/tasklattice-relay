import {
  agentConnectionSchema,
  agentGardenEntrySchema,
  agentGardenSnapshotSchema,
  createAgentConnectionSchema,
  createKnowledgeSourceDefinitionSchema,
  createMcpServerDefinitionSchema,
  createSkillDefinitionSchema,
  knowledgeSourceDefinitionSchema,
  mcpServerDefinitionSchema,
  onboardAgentSchema,
  skillDefinitionSchema,
  updateKnowledgeSourceDefinitionSchema,
  updateMcpServerDefinitionSchema,
  updateSkillDefinitionSchema,
} from "@tali/contracts";
import { z } from "zod";
import { defineContracts } from "./contract";
import { projectRoute, response, route } from "./helpers";
import {
  catalogCollectionParamsSchema,
  catalogNamedResourceParamsSchema,
  catalogResourceParamsSchema,
  demoAgentParamsSchema,
  demoAgentMessageInputSchema,
  domainObjectSchema,
  gardenAgentParamsSchema,
  gardenConnectionParamsSchema,
  messageSchema,
  runtimeBridgeAgentParamsSchema,
  runtimeBridgeCoordinatorParamsSchema,
} from "./schemas";

const catalogSchema = z.object({
  skills: z.array(skillDefinitionSchema),
  mcpServers: z.array(mcpServerDefinitionSchema),
  knowledgeSources: z.array(knowledgeSourceDefinitionSchema),
}).loose().meta({ id: "ResourceCatalog" });

const createCatalogInputSchema = z.union([
  createSkillDefinitionSchema,
  createMcpServerDefinitionSchema,
  createKnowledgeSourceDefinitionSchema,
]);
const updateCatalogInputSchema = z.union([
  updateSkillDefinitionSchema,
  updateMcpServerDefinitionSchema,
  updateKnowledgeSourceDefinitionSchema,
]);
const catalogResourceSchema = z.union([
  skillDefinitionSchema,
  mcpServerDefinitionSchema,
  knowledgeSourceDefinitionSchema,
]);

export const catalogContracts = defineContracts([
  projectRoute({
    method: "get", path: "/catalog", operationId: "getResourceCatalog",
    summary: "Read the Project resource catalog", tags: ["Resource catalog"],
    responses: { 200: response("Resource catalog", catalogSchema) },
  }),
  projectRoute({
    method: "post", path: "/catalog/{kind}", operationId: "createCatalogResource",
    summary: "Create a catalog resource", tags: ["Resource catalog"],
    request: { params: catalogCollectionParamsSchema, body: createCatalogInputSchema },
    responses: { 201: response("Created catalog resource", catalogResourceSchema) },
  }),
  projectRoute({
    method: "put", path: "/catalog/{kind}/{id}", operationId: "updateCatalogResource",
    summary: "Update a catalog resource", tags: ["Resource catalog"],
    request: { params: catalogResourceParamsSchema, body: updateCatalogInputSchema },
    responses: { 200: response("Updated catalog resource", catalogResourceSchema) },
  }),
  projectRoute({
    method: "delete", path: "/catalog/{kind}/{id}", operationId: "deleteCatalogResource",
    summary: "Delete a catalog resource", tags: ["Resource catalog"],
    request: { params: catalogResourceParamsSchema },
    responses: { 200: response("Deleted catalog resource", messageSchema) },
  }),
  projectRoute({
    method: "post", path: "/catalog/mcp-servers/{id}/discover", operationId: "discoverMcpServerTools",
    summary: "Discover MCP server tools", tags: ["Resource catalog"],
    request: { params: catalogNamedResourceParamsSchema },
    responses: { 200: response("Discovered MCP server", mcpServerDefinitionSchema) },
  }),
  projectRoute({
    method: "post", path: "/catalog/skills/{id}/verify", operationId: "verifySkillArtifact",
    summary: "Verify a Skill artifact", tags: ["Resource catalog"],
    request: { params: catalogNamedResourceParamsSchema },
    responses: { 200: response("Verified Skill", skillDefinitionSchema) },
  }),
  projectRoute({
    method: "get", path: "/catalog/skills/{id}/archive", operationId: "downloadSkillArtifact",
    summary: "Download a Skill artifact", tags: ["Resource catalog"],
    request: { params: catalogNamedResourceParamsSchema },
    responses: { 200: response("Skill archive", z.string().meta({ contentEncoding: "binary" }), "application/gzip") },
  }),
  projectRoute({
    method: "get", path: "/agent-garden", operationId: "getAgentGarden",
    summary: "Read the Project Agent Garden", tags: ["Agent Garden"],
    responses: { 200: response("Agent Garden snapshot", agentGardenSnapshotSchema) },
  }),
  projectRoute({
    method: "post", path: "/agent-garden/onboard", operationId: "onboardGardenAgent",
    summary: "Onboard an A2A Agent into the Project Agent Garden",
    description: "Deploy an A2A-compatible container image or connect an existing Agent through its A2A 1.0 Agent Card. The implementation framework is not part of the onboarding contract.",
    tags: ["Agent Garden"],
    request: { body: onboardAgentSchema },
    responses: { 201: response("Onboarded Agent", agentGardenEntrySchema) },
  }),
  projectRoute({
    method: "delete", path: "/agent-garden/agents/{id}", operationId: "removeGardenAgent",
    summary: "Remove an Agent Garden entry", tags: ["Agent Garden"],
    request: { params: gardenAgentParamsSchema },
    responses: { 200: response("Removed Agent", messageSchema) },
  }),
  projectRoute({
    method: "post", path: "/agent-garden/agents/{id}/discover", operationId: "discoverGardenAgent",
    summary: "Refresh an Agent Garden entry", tags: ["Agent Garden"],
    request: { params: gardenAgentParamsSchema },
    responses: { 200: response("Discovered Agent", agentGardenEntrySchema) },
  }),
  projectRoute({
    method: "post", path: "/agent-garden/connections", operationId: "connectGardenAgent",
    summary: "Connect an Agent Garden entry", tags: ["Agent Garden"],
    request: { body: createAgentConnectionSchema },
    responses: { 201: response("Created Agent connection", agentConnectionSchema) },
  }),
  projectRoute({
    method: "delete", path: "/agent-garden/connections/{id}", operationId: "disconnectGardenAgent",
    summary: "Disconnect an Agent Garden entry", tags: ["Agent Garden"],
    request: { params: gardenConnectionParamsSchema },
    responses: { 200: response("Disconnected Agent", messageSchema) },
  }),
  route({
    auth: "public", method: "get", path: "/demo-agents/{id}/agent-card",
    operationId: "getDemoAgentCard", summary: "Read a demo Agent Card", tags: ["Demo Agents"],
    request: { params: demoAgentParamsSchema },
    responses: { 200: response("Demo Agent Card", domainObjectSchema) },
  }),
  route({
    auth: "public", method: "post", path: "/demo-agents/{id}",
    operationId: "sendDemoAgentMessage", summary: "Send a message to a demo Agent", tags: ["Demo Agents"],
    request: { params: demoAgentParamsSchema, body: demoAgentMessageInputSchema },
    responses: { 200: response("Demo Agent response", domainObjectSchema) },
  }),
  route({
    auth: "runtime-bridge", method: "get",
    path: "/runtime-bridge/coordinators/{coordinatorInstanceId}/agents",
    operationId: "listRuntimeBridgeAgents",
    summary: "List Project-enabled A2A Agents for a Coordinator",
    tags: ["Runtime Bridge"],
    request: { params: runtimeBridgeCoordinatorParamsSchema },
    responses: { 200: response("Project A2A peer directory", domainObjectSchema) },
  }),
  route({
    auth: "runtime-bridge", method: "get",
    path: "/runtime-bridge/coordinators/{coordinatorInstanceId}/agents/{agentId}/agent-card",
    operationId: "getRuntimeBridgeAgentCard",
    summary: "Read a connected Agent Card through the Project Runtime Bridge",
    tags: ["Runtime Bridge"],
    request: { params: runtimeBridgeAgentParamsSchema },
    responses: { 200: response("Proxied A2A Agent Card", domainObjectSchema) },
  }),
  route({
    auth: "runtime-bridge", method: "post",
    path: "/runtime-bridge/coordinators/{coordinatorInstanceId}/agents/{agentId}",
    operationId: "sendRuntimeBridgeAgentMessage",
    summary: "Send an A2A message through the Project Runtime Bridge",
    tags: ["Runtime Bridge"],
    request: { params: runtimeBridgeAgentParamsSchema, body: domainObjectSchema },
    responses: { 200: response("Proxied A2A response", domainObjectSchema) },
  }),
]);
