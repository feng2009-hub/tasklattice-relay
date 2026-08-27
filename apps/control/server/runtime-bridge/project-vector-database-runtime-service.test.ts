import { describe, expect, it, vi } from "vitest";
import type {
  Instance,
  KnowledgeSourceDefinition,
  VectorDatabaseSearchResult,
} from "@tali/contracts";
import { ProjectVectorDatabaseRuntimeService } from "./project-vector-database-runtime-service";

const coordinator = {
  id: "coordinator-1",
  agentPlatform: "hermes",
} as Instance;

const registeredDatabase = {
  id: "papers",
  name: "Research Papers",
  description: "Project-scoped research papers.",
  topK: 8,
  status: "REGISTERED",
} as KnowledgeSourceDefinition;

const unavailableDatabase = {
  ...registeredDatabase,
  id: "offline",
  name: "Offline Database",
  status: "UNAVAILABLE",
} as KnowledgeSourceDefinition;

function service(input: {
  agent?: Instance;
  databases?: KnowledgeSourceDefinition[];
  searchResult?: VectorDatabaseSearchResult;
} = {}) {
  const databases = input.databases ?? [registeredDatabase, unavailableDatabase];
  const store = {
    get: vi.fn(async () => input.agent ?? coordinator),
    getKnowledgeSourceDefinition: vi.fn(async (id: string) =>
      databases.find((database) => database.id === id)),
    listKnowledgeSourceDefinitions: vi.fn(async () => databases),
  };
  const catalog = {
    searchVectorDatabase: vi.fn(async () => input.searchResult ?? ({
      query: "multi-agent teams",
      durationMs: 12,
      results: [{
        id: "chunk-1",
        content: "The paper reports a coordination penalty.",
        filename: "paper.pdf",
        score: 0.91,
        pageNumber: 4,
        sectionPath: ["Results"],
        attributes: { internal: "not exposed to the runtime" },
      }],
    })),
  };
  return {
    catalog,
    store,
    runtime: new ProjectVectorDatabaseRuntimeService("proj1", {
      catalog,
      store,
    }),
  };
}

describe("ProjectVectorDatabaseRuntimeService", () => {
  it("lists the current registered Project Vector Databases without provider secrets", async () => {
    const { runtime } = service();
    await expect(runtime.list(coordinator.id)).resolves.toEqual([{
      id: "papers",
      name: "Research Papers",
      description: "Project-scoped research papers.",
      topK: 8,
    }]);
  });

  it("searches a Project Vector Database and returns citation-safe chunks", async () => {
    const { catalog, runtime } = service();
    await expect(runtime.search(coordinator.id, "papers", {
      query: "multi-agent teams",
      topK: 5,
    })).resolves.toEqual({
      query: "multi-agent teams",
      durationMs: 12,
      results: [{
        id: "chunk-1",
        content: "The paper reports a coordination penalty.",
        filename: "paper.pdf",
        score: 0.91,
        pageNumber: 4,
        sectionPath: ["Results"],
      }],
    });
    expect(catalog.searchVectorDatabase).toHaveBeenCalledWith("papers", {
      query: "multi-agent teams",
      topK: 5,
    });
  });

  it("rejects unavailable databases and non-Hermes coordinators", async () => {
    const { runtime } = service();
    await expect(runtime.search(coordinator.id, "offline", {
      query: "test",
      topK: 8,
    })).rejects.toThrow("not found or is unavailable");

    const nonHermes = service({
      agent: { ...coordinator, agentPlatform: "openclaw" },
    });
    await expect(nonHermes.runtime.list(coordinator.id)).rejects.toThrow(
      "available to Hermes Instances only",
    );
  });
});
