import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { ControlJobPublisher } from "../jobs/control-job-queue";
import { createTestStore } from "../test/store";
import type { VectorDocumentParser } from "./docling-client";
import { KnowledgeVectorDatabase } from "./knowledge-vector-database";
import { VectorDocumentService } from "./vector-document-service";

async function setup() {
  const store = createTestStore();
  const definition = await store.saveKnowledgeSourceDefinition({
    id: "built-in-vectors",
    name: "Built-in vectors",
    description: "Docling-backed Project documents.",
    vectorStoreId: "built-in-vectors",
    provider: "postgresql",
    embeddingModel: "tali/openai/text-embedding-3-small",
    embeddingDimensions: 3,
    credentialReference: "",
    status: "REGISTERED",
    lastReconciliationError: null,
    topK: 8,
  });
  const vectors = new KnowledgeVectorDatabase(store, {
    createEmbeddings: vi.fn(async (_model: string, input: string[]) =>
      input.map(() => [0.1, 0.2, 0.3])
    ),
  });
  await vectors.provision(definition);
  const replace = vi.spyOn(vectors, "replaceDocumentChunks").mockResolvedValue({ upserted: 1 });
  const parser: VectorDocumentParser = {
    parse: vi.fn(async () => ({
      chunks: [{
        attributes: { doc_items: ["#/texts/1"], page_numbers: [1] },
        content: "A parsed section",
        index: 0,
        label: "text",
        pageNumber: 1,
        sectionPath: ["Introduction"],
        tokenCount: 4,
      }],
      document: { pages: { "1": {} } },
      ocrPageCount: 0,
      pageCount: 1,
      processingTimeSeconds: 0.1,
    })),
  };
  const publisher: ControlJobPublisher = {
    enqueueProjectDeletion: vi.fn(async () => randomUUID()),
    enqueueProjectRuntimeReconcile: vi.fn(async () => randomUUID()),
    enqueueVectorDocumentIngestion: vi.fn(async () => randomUUID()),
    start: vi.fn(async () => undefined),
  };
  return {
    parser,
    publisher,
    replace,
    service: new VectorDocumentService(store, vectors, parser),
    store,
  };
}

function upload(content: string, name = "handbook.pdf") {
  const bytes = new TextEncoder().encode(content);
  return {
    name,
    size: bytes.byteLength,
    type: "application/pdf",
    arrayBuffer: async () => bytes.buffer,
  };
}

describe("VectorDocumentService", () => {
  it("queues, parses, embeds, and activates a Docling document revision", async () => {
    const { parser, publisher, replace, service, store } = await setup();
    const queued = await service.queue("built-in-vectors", upload("pdf-v1"), "account-1", publisher);

    expect(queued.document.status).toBe("QUEUED");
    expect(publisher.enqueueVectorDocumentIngestion).toHaveBeenCalledOnce();
    await service.process({
      projectId: store.projectId,
      databaseId: "built-in-vectors",
      ingestionJobId: queued.job.id,
    });

    expect(parser.parse).toHaveBeenCalledWith(expect.objectContaining({ filename: "handbook.pdf" }));
    expect(replace).toHaveBeenCalledWith("built-in-vectors", expect.objectContaining({
      documentId: queued.document.id,
      revision: 1,
    }));
    await expect(service.overview("built-in-vectors")).resolves.toMatchObject({
      documents: [{
        id: queued.document.id,
        status: "READY",
        activeRevision: 1,
        chunkCount: 1,
        pageCount: 1,
      }],
      jobs: [{ id: queued.job.id, status: "COMPLETED", progress: 100 }],
    });
    await expect(store.database().vectorDocumentRevision.findFirstOrThrow({
      where: { documentId: queued.document.id, revision: 1 },
    })).resolves.toMatchObject({ sourceBytes: null });
  });

  it("allocates revisions from persisted history while the active revision is unchanged", async () => {
    const { publisher, service, store } = await setup();
    const first = await service.queue("built-in-vectors", upload("pdf-v1"), "account-1", publisher);
    const second = await service.queue("built-in-vectors", upload("pdf-v2"), "account-1", publisher);

    expect(second.document.id).toBe(first.document.id);
    expect(second.job.revision).toBe(2);
    await expect(store.database().vectorDocumentRevision.findMany({
      where: { documentId: first.document.id },
      orderBy: { revision: "asc" },
    })).resolves.toMatchObject([{ revision: 1 }, { revision: 2 }]);
  });

  it("keeps the same filename in separate persistent directories", async () => {
    const { publisher, service } = await setup();
    const research = await service.queue(
      "built-in-vectors",
      upload("research"),
      "account-1",
      publisher,
      { directoryPath: "/Research/Agents" },
    );
    const reports = await service.queue(
      "built-in-vectors",
      upload("reports"),
      "account-1",
      publisher,
      { directoryPath: "/Reports" },
    );

    expect(research.document.id).not.toBe(reports.document.id);
    expect(research.document.directoryPath).toBe("/Research/Agents");
    expect(reports.document.directoryPath).toBe("/Reports");
  });
});
