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
  constructor(readonly store = new AgentStore()) {}

  async catalog(): Promise<ExtensionCatalog> {
    return {
      skills: await this.store.listSkillDefinitions(),
      mcpServers: await this.store.listMcpServerDefinitions(),
      knowledgeSources: await this.store.listKnowledgeSourceDefinitions(),
      specializations: await this.store.listAgentSpecializations(),
    };
  }

  async createSkill(input: CreateSkillDefinitionInput): Promise<SkillDefinition> {
    return this.store.saveSkillDefinition({ id: resourceId(input.name), bindings: 0, ...input });
  }

  async updateSkill(id: string, input: UpdateSkillDefinitionInput): Promise<SkillDefinition> {
    const current = await this.store.getSkillDefinition(id);
    if (!current) throw new Error("Skill was not found.");
    return this.store.saveSkillDefinition({ ...current, ...input, id });
  }

  async createMcpServer(input: CreateMcpServerDefinitionInput): Promise<McpServerDefinition> {
    assertJsonObject(input.parameters);
    return this.store.saveMcpServerDefinition({ id: resourceId(input.name), ...input });
  }

  async updateMcpServer(id: string, input: UpdateMcpServerDefinitionInput): Promise<McpServerDefinition> {
    const current = await this.store.getMcpServerDefinition(id);
    if (!current) throw new Error("MCP server was not found.");
    assertJsonObject(input.parameters);
    return this.store.saveMcpServerDefinition({ ...current, ...input, id });
  }

  async createKnowledgeSource(input: CreateKnowledgeSourceDefinitionInput): Promise<KnowledgeSourceDefinition> {
    return this.store.saveKnowledgeSourceDefinition({ id: resourceId(input.name), ...input });
  }

  async updateKnowledgeSource(id: string, input: UpdateKnowledgeSourceDefinitionInput): Promise<KnowledgeSourceDefinition> {
    const current = await this.store.getKnowledgeSourceDefinition(id);
    if (!current) throw new Error("Knowledge source was not found.");
    return this.store.saveKnowledgeSourceDefinition({ ...current, ...input, id });
  }

  async delete(kind: ExtensionResourceKind, id: string): Promise<boolean> {
    if (await this.store.isExtensionResourceInUse(kind, id))
      throw new Error("This extension is assigned to a Role or Instance and cannot be deleted.");
    if (kind === "skills") return this.store.deleteSkillDefinition(id);
    if (kind === "mcp-servers") return this.store.deleteMcpServerDefinition(id);
    return this.store.deleteKnowledgeSourceDefinition(id);
  }
}
