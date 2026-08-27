import { describe, expect, it, vi } from "vitest";
import { createTestStore } from "../test/store";
import {
  KnowledgePdfIngestionService,
  NvidiaNemotronOcrClient,
  nvidiaApiKeyFromStoredProviderCredential,
  type PdfOcrClient,
  type PdfToolchain,
  type UploadedPdf,
} from "./knowledge-pdf-ingestion-service";

async function registeredStore() {
  const store = createTestStore();
  await store.saveKnowledgeSourceDefinition({
    id: "engineering-handbook",
    name: "Engineering handbook",
    description: "Approved engineering knowledge stored as PostgreSQL vectors.",
    vectorStoreId: "engineering-handbook",
    provider: "postgresql",
    embeddingModel: "tali/nvidia/llama-nemotron-embed-1b-v2",
    embeddingDimensions: 3,
    credentialReference: "",
    status: "REGISTERED",
    lastReconciliationError: null,
    topK: 8,
  });
  return store;
}

function uploadedPdf(name = "handbook.pdf"): UploadedPdf {
  const bytes = new TextEncoder().encode("%PDF-1.7\nsynthetic unit test bytes");
  return {
    name,
    size: bytes.byteLength,
    type: "application/pdf",
    arrayBuffer: async () => bytes.slice().buffer,
  };
}

function vectorWriter() {
  return {
    upsertChunks: vi.fn(async (_sourceId: string, input: { chunks: unknown[] }) => ({
      upserted: input.chunks.length,
    })),
    deleteDocumentRevisions: vi.fn(async () => 0),
  };
}

describe("KnowledgePdfIngestionService", () => {
  it("extracts text PDFs locally and writes page-aware vector chunks", async () => {
    const store = await registeredStore();
    const pdf: PdfToolchain = {
      pageCount: vi.fn(async () => 2),
      extractPage: vi.fn(async (_path, page) =>
        page === 1
          ? "Architecture standards require reviewed service boundaries and explicit ownership."
          : "Operations standards require tested rollback procedures and production verification."
      ),
      renderPage: vi.fn(),
    };
    const ocr: PdfOcrClient = { recognize: vi.fn() };
    const vectors = vectorWriter();
    const service = new KnowledgePdfIngestionService(store, vectors, pdf, ocr);

    await expect(service.ingest("engineering-handbook", uploadedPdf()))
      .resolves.toMatchObject({
        filename: "handbook.pdf",
        pageCount: 2,
        extractedPages: 2,
        ocrPages: 0,
        chunks: 2,
      });

    expect(pdf.renderPage).not.toHaveBeenCalled();
    expect(ocr.recognize).not.toHaveBeenCalled();
    expect(vectors.upsertChunks).toHaveBeenCalledOnce();
    const input = vectors.upsertChunks.mock.calls[0]![1] as {
      chunks: Array<{ attributes: Record<string, unknown>; filename: string }>;
    };
    expect(input.chunks.map((chunk) => chunk.attributes.page_number)).toEqual([1, 2]);
    expect(input.chunks[0]).toMatchObject({
      filename: "handbook.pdf",
      attributes: {
        extraction: "pdf-text",
        media_type: "application/pdf",
      },
    });
    expect(vectors.deleteDocumentRevisions).toHaveBeenCalledWith(
      "engineering-handbook",
      expect.stringMatching(/^pdf-/),
      expect.stringMatching(/^sha256:/),
    );
  });

  it("renders only scanned pages and sends them to NVIDIA OCR", async () => {
    const store = await registeredStore();
    const pdf: PdfToolchain = {
      pageCount: vi.fn(async () => 2),
      extractPage: vi.fn(async (_path, page) => page === 1
        ? "This page already contains enough embedded searchable text for local extraction."
        : ""),
      renderPage: vi.fn(async () => new Uint8Array([137, 80, 78, 71])),
    };
    const ocr: PdfOcrClient = {
      recognize: vi.fn(async () => ["扫描页经过 OCR 后成为可搜索的中文知识内容。"]),
    };
    const vectors = vectorWriter();
    const service = new KnowledgePdfIngestionService(store, vectors, pdf, ocr);

    const result = await service.ingest(
      "engineering-handbook",
      uploadedPdf("扫描手册.pdf"),
      { nvidiaApiKey: "nvapi-test" },
    );

    expect(result).toMatchObject({ extractedPages: 1, ocrPages: 1, chunks: 2 });
    expect(pdf.renderPage).toHaveBeenCalledOnce();
    expect(ocr.recognize).toHaveBeenCalledWith(
      [new Uint8Array([137, 80, 78, 71])],
      "nvapi-test",
    );
    const chunks = (vectors.upsertChunks.mock.calls[0]![1] as {
      chunks: Array<{ attributes: Record<string, unknown> }>;
    }).chunks;
    expect(chunks[1]!.attributes).toMatchObject({
      extraction: "nvidia-ocr",
      page_number: 2,
    });
  });

  it("rejects non-PDF bytes before invoking document tools", async () => {
    const store = await registeredStore();
    const pdf: PdfToolchain = {
      pageCount: vi.fn(),
      extractPage: vi.fn(),
      renderPage: vi.fn(),
    };
    const file = uploadedPdf();
    const invalid: UploadedPdf = {
      ...file,
      arrayBuffer: async () => new TextEncoder().encode("not a pdf").buffer,
      size: 9,
    };
    const service = new KnowledgePdfIngestionService(
      store,
      vectorWriter(),
      pdf,
      { recognize: vi.fn() },
    );

    await expect(service.ingest("engineering-handbook", invalid))
      .rejects.toThrow("PDF signature");
    expect(pdf.pageCount).not.toHaveBeenCalled();
  });
});

describe("NvidiaNemotronOcrClient", () => {
  it("uses the NVAPI compatibility variable and restores reading order", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) =>
      new Response(JSON.stringify({
        data: [{
          text_detections: [
            {
              text_prediction: { text: "world", confidence: 0.9 },
              bounding_box: { points: [{ x: 0.4, y: 0.1 }] },
            },
            {
              text_prediction: { text: "Hello", confidence: 0.9 },
              bounding_box: { points: [{ x: 0.1, y: 0.1 }] },
            },
          ],
        }],
      }), { status: 200 })) as typeof fetch;
    const client = new NvidiaNemotronOcrClient(fetchImpl, {
      NVAPI_API_KEY: "test-compatibility-key",
    });

    await expect(client.recognize([new Uint8Array([1, 2, 3])]))
      .resolves.toEqual(["Hello world"]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://ai.api.nvidia.com/v1/cv/nvidia/nemotron-ocr-v2",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer test-compatibility-key",
        }),
      }),
    );
  });

  it("requires a key for NVIDIA-hosted OCR", async () => {
    const client = new NvidiaNemotronOcrClient(vi.fn() as typeof fetch, {});
    await expect(client.recognize([new Uint8Array([1])]))
      .rejects.toThrow("NVIDIA_API_KEY");
  });
});

describe("nvidiaApiKeyFromStoredProviderCredential", () => {
  it("reads the API key stored by the NVIDIA Provider setup flow", () => {
    expect(nvidiaApiKeyFromStoredProviderCredential(JSON.stringify({
      version: 1,
      provider: "nvidia-nim",
      config: { endpoint: "https://integrate.api.nvidia.com/v1" },
      credentials: { apiKey: "test-provider-key" },
    }))).toBe("test-provider-key");
  });
});
