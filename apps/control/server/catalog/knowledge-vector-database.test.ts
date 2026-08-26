import { describe, expect, it, vi } from "vitest";
import { createTestStore } from "../test/store";
import { KnowledgeVectorDatabase } from "./knowledge-vector-database";

async function setup() {
  const store = createTestStore();
  const source = await store.saveKnowledgeSourceDefinition({
    id: "engineering-handbook",
    name: "Engineering handbook",
    description: "Approved engineering standards stored as PostgreSQL vectors.",
    vectorStoreId: "engineering-handbook",
    provider: "postgresql",
    embeddingModel: "tali/openai/text-embedding-3-small",
    embeddingDimensions: 3,
    credentialReference: "",
    status: "REGISTERED",
    lastReconciliationError: null,
    topK: 8,
  });
  const embeddings = {
    createEmbeddings: vi.fn(async (_model: string, input: string[]) =>
      input.map(() => [0.1, 0.2, 0.3])
    ),
  };
  const vectors = new KnowledgeVectorDatabase(store, embeddings);
  await vectors.provision(source);
  return { embeddings, source, store, vectors };
}

describe("KnowledgeVectorDatabase", () => {
  it("provisions Project-scoped vector metadata and preserves its dimensions", async () => {
    const { source, store } = await setup();

    await expect(store.database().knowledgeVectorDatabase.findUnique({
      where: { projectId_id: { projectId: store.projectId, id: source.id } },
    })).resolves.toMatchObject({
      vectorStoreId: "engineering-handbook",
      embeddingModel: "tali/openai/text-embedding-3-small",
      embeddingDimensions: 3,
    });
  });

  it("embeds a query and maps cosine-search rows to the LiteLLM protocol", async () => {
    const { embeddings, store, vectors } = await setup();
    const query = vi.spyOn(store.database(), "$queryRaw").mockResolvedValue([
      {
        id: "runbook-42",
        content: "Restart the service after rotating credentials.",
        filename: "operations/runbook.md",
        attributes: { environment: "production" },
        score: 0.91,
      },
    ]);

    const result = await vectors.search("engineering-handbook", {
      query: "How do I rotate credentials?",
      max_num_results: 4,
      filters: { type: "eq", key: "environment", value: "production" },
    });

    expect(embeddings.createEmbeddings).toHaveBeenCalledWith(
      "tali/openai/text-embedding-3-small",
      ["How do I rotate credentials?"],
    );
    expect(query).toHaveBeenCalledOnce();
    expect(result).toEqual({
      object: "vector_store.search_results.page",
      search_query: "How do I rotate credentials?",
      data: [
        {
          score: 0.91,
          content: [{ type: "text", text: "Restart the service after rotating credentials." }],
          file_id: "runbook-42",
          filename: "operations/runbook.md",
          attributes: { environment: "production" },
        },
      ],
    });
  });

  it("rejects embeddings whose dimensions do not match the database", async () => {
    const { embeddings, vectors } = await setup();
    embeddings.createEmbeddings.mockResolvedValueOnce([[0.1, 0.2]]);

    await expect(vectors.search("engineering-handbook", {
      query: "dimension mismatch",
    })).rejects.toThrow("expected 3, received 2");
  });

  it("embeds and upserts chunk batches through a parameterized transaction", async () => {
    const { embeddings, store, vectors } = await setup();
    const execute = vi.fn(async () => 1);
    vi.spyOn(store.database(), "$transaction").mockImplementation((async (callback: unknown) =>
      (callback as (transaction: { $executeRaw: typeof execute }) => Promise<unknown>)({
        $executeRaw: execute,
      })) as never);

    await expect(vectors.upsertChunks("engineering-handbook", {
      chunks: [
        {
          id: "chunk-1",
          content: "Rotate the credential, then restart the service.",
          filename: "runbook.md",
          attributes: { environment: "production" },
        },
        {
          id: "chunk-2",
          content: "Verify the new credential before closing the change.",
          attributes: {},
        },
      ],
    })).resolves.toEqual({ upserted: 2 });

    expect(embeddings.createEmbeddings).toHaveBeenCalledWith(
      "tali/openai/text-embedding-3-small",
      [
        "Rotate the credential, then restart the service.",
        "Verify the new credential before closing the change.",
      ],
    );
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
