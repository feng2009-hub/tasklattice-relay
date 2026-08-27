import { describe, expect, it, vi } from "vitest";
import { DoclingClient } from "./docling-client";

describe("DoclingClient", () => {
  it("uses the official hybrid chunk endpoint and preserves document structure", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = init?.body as FormData;
      expect(body.get("convert_from_formats")).toBe("pdf");
      expect(body.get("convert_do_ocr")).toBe("true");
      expect(body.get("convert_do_pdf_heading_hierarchy")).toBe("true");
      expect(body.get("chunking_max_tokens")).toBe("512");
      expect(body.get("include_converted_doc")).toBe("true");
      expect(body.get("files")).toBeInstanceOf(File);
      return new Response(JSON.stringify({
        chunks: [{
          filename: "handbook.pdf",
          chunk_index: 0,
          text: "  Rotation procedure  ",
          raw_text: "Rotation procedure",
          num_tokens: 9,
          headings: ["Operations", "Credentials"],
          captions: [],
          doc_items: ["#/texts/12"],
          page_numbers: [2],
          metadata: { origin: "docling" },
        }],
        documents: [{ document: { json_content: { pages: { "1": {}, "2": {} } } } }],
        processing_time: 1.25,
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const client = new DoclingClient(
      "http://docling.test/",
      undefined,
      fetcher as typeof fetch,
    );

    await expect(client.parse({
      bytes: new TextEncoder().encode("fake-pdf"),
      filename: "handbook.pdf",
      mediaType: "application/pdf",
    })).resolves.toEqual({
      chunks: [{
        content: "Rotation procedure",
        index: 0,
        label: "text",
        pageNumber: 2,
        sectionPath: ["Operations", "Credentials"],
        tokenCount: 9,
        attributes: {
          captions: [],
          doc_items: ["#/texts/12"],
          page_numbers: [2],
          origin: "docling",
        },
      }],
      document: { pages: { "1": {}, "2": {} } },
      ocrPageCount: 0,
      pageCount: 2,
      processingTimeSeconds: 1.25,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "http://docling.test/v1/chunk/hybrid/file",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("surfaces Docling HTTP failures without accepting an empty index", async () => {
    const client = new DoclingClient(
      "http://docling.test",
      undefined,
      vi.fn(async () => new Response("model unavailable", { status: 503 })) as typeof fetch,
    );
    await expect(client.parse({
      bytes: new Uint8Array([1]),
      filename: "scan.png",
      mediaType: "image/png",
    })).rejects.toThrow("HTTP 503: model unavailable");
  });
});
