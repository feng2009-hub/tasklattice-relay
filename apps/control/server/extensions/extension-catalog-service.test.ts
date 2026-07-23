import { describe, expect, it } from "vitest";
import { createTestStore } from "../test/store";
import { ExtensionCatalogService } from "./extension-catalog-service";

describe("ExtensionCatalogService", () => {
  it("loads PostgreSQL catalog defaults and platform skills", async () => {
    const service = new ExtensionCatalogService(createTestStore());
    const catalog = await service.catalog();

    expect(catalog.skills).toHaveLength(15);
    expect(catalog.skills.map((skill) => skill.name)).toEqual(expect.arrayContaining([
      "Helm Chart Developer",
      "Kubernetes Expert",
      "OCP Expert",
    ]));
    expect(catalog.skills.find((skill) => skill.id === "kubernetes-expert")?.category)
      .toBe(catalog.skills.find((skill) => skill.id === "helm-chart-developer")?.category);
    expect(catalog.specializations.find((item) => item.id === "devops-engineer")?.defaultSkillIds)
      .toEqual(expect.arrayContaining(["helm-chart-developer", "kubernetes-expert", "ocp-expert"]));
  });

  it("persists workspace changes without overwriting them when defaults are seeded again", async () => {
    const store = createTestStore();
    const service = new ExtensionCatalogService(store);
    const current = (await service.catalog()).skills.find((skill) => skill.id === "helm-chart-developer")!;

    await service.updateSkill(current.id, { ...current, name: "Helm Platform Developer" });
    const restarted = new ExtensionCatalogService(store);

    expect((await restarted.catalog()).skills.find((skill) => skill.id === current.id)?.name)
      .toBe("Helm Platform Developer");
  });

  it("creates and removes workspace extensions while protecting Role references", async () => {
    const service = new ExtensionCatalogService(createTestStore());
    const created = await service.createSkill({
      name: "Release Notes Writer",
      description: "Draft structured release notes from approved change records.",
      category: "Developer Tools",
      version: "1.0.0",
      endpoint: "https://skills.internal.example/release-notes.tar.zst",
      digest: "Pending source check",
      owner: "Current workspace",
      permissions: 0,
      status: "DRAFT",
    });

    expect(await service.delete("skills", created.id)).toBe(true);
    await expect(service.delete("skills", "kubernetes-expert"))
      .rejects.toThrow("assigned to a Role or Instance");
  });

  it("requires MCP parameters to be a JSON object", async () => {
    const service = new ExtensionCatalogService(createTestStore());
    await expect(service.createMcpServer({
      name: "Invalid MCP",
      endpoint: "https://mcp.internal.example/invalid",
      transport: "Streamable HTTP",
      authReference: "",
      parameters: "[]",
      status: "UNCHECKED",
      tools: 0,
    })).rejects.toThrow("JSON object");
  });
});
