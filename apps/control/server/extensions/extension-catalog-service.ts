import { randomUUID } from "node:crypto";
import type {
  CreateKnowledgeSourceDefinitionInput,
  CreateMcpServerDefinitionInput,
  CreateSkillDefinitionInput,
  ExtensionCatalog,
  ExtensionResourceKind,
  KnowledgeSourceDefinition,
  McpServerDefinition,
  SkillDefinition,
  UpdateKnowledgeSourceDefinitionInput,
  UpdateMcpServerDefinitionInput,
  UpdateSkillDefinitionInput,
} from "@tasklattice/contracts";
import { AgentStore } from "../data/agent-store";
import { developmentExtensionCatalog } from "./development-extension-catalog";

function resourceId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
    .replace(/-$/, "") || "extension";
  return `${slug}-${randomUUID().slice(0, 8)}`;
}

function assertJsonObject(input: string): void {
  let value: unknown;
  try {
    value = JSON.parse(input);
  } catch {
    throw new Error("MCP parameters must be valid JSON.");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("MCP parameters must be a JSON object.");
}

export class ExtensionCatalogService {
  constructor(readonly store = new AgentStore()) {
    if (process.env.TALI_EXTENSION_CATALOG_SEED !== "none")
      this.store.seedExtensionCatalog(developmentExtensionCatalog);
  }

  catalog(): ExtensionCatalog {
    return {
      skills: this.store.listSkillDefinitions(),
      mcpServers: this.store.listMcpServerDefinitions(),
      knowledgeSources: this.store.listKnowledgeSourceDefinitions(),
      specializations: this.store.listAgentSpecializations(),
    };
  }

  createSkill(input: CreateSkillDefinitionInput): SkillDefinition {
    return this.store.saveSkillDefinition({ id: resourceId(input.name), bindings: 0, ...input });
  }

  updateSkill(id: string, input: UpdateSkillDefinitionInput): SkillDefinition {
    const current = this.store.getSkillDefinition(id);
    if (!current) throw new Error("Skill was not found.");
    return this.store.saveSkillDefinition({ ...current, ...input, id });
  }

  createMcpServer(input: CreateMcpServerDefinitionInput): McpServerDefinition {
    assertJsonObject(input.parameters);
    return this.store.saveMcpServerDefinition({ id: resourceId(input.name), ...input });
  }

  updateMcpServer(id: string, input: UpdateMcpServerDefinitionInput): McpServerDefinition {
    const current = this.store.getMcpServerDefinition(id);
    if (!current) throw new Error("MCP server was not found.");
    assertJsonObject(input.parameters);
    return this.store.saveMcpServerDefinition({ ...current, ...input, id });
  }

  createKnowledgeSource(input: CreateKnowledgeSourceDefinitionInput): KnowledgeSourceDefinition {
    return this.store.saveKnowledgeSourceDefinition({ id: resourceId(input.name), ...input });
  }

  updateKnowledgeSource(id: string, input: UpdateKnowledgeSourceDefinitionInput): KnowledgeSourceDefinition {
    const current = this.store.getKnowledgeSourceDefinition(id);
    if (!current) throw new Error("Knowledge source was not found.");
    return this.store.saveKnowledgeSourceDefinition({ ...current, ...input, id });
  }

  delete(kind: ExtensionResourceKind, id: string): boolean {
    if (this.store.isExtensionResourceInUse(kind, id))
      throw new Error("This extension is assigned to a Role or Instance and cannot be deleted.");
    if (kind === "skills") return this.store.deleteSkillDefinition(id);
    if (kind === "mcp-servers") return this.store.deleteMcpServerDefinition(id);
    return this.store.deleteKnowledgeSourceDefinition(id);
  }
}
