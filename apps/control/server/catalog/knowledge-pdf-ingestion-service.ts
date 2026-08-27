import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import type {
  KnowledgePdfIngestionResult,
  KnowledgeVectorChunkInput,
} from "@tali/contracts";
import { ProjectStore } from "../projects/project-store";
import { KnowledgeVectorDatabase } from "./knowledge-vector-database";

const execFileAsync = promisify(execFile);
const MAX_PDF_BYTES = 25 * 1024 * 1024;
const MAX_PDF_PAGES = 100;
const TEXT_EXTRACTION_THRESHOLD = 24;
const VECTOR_BATCH_SIZE = 64;

export interface UploadedPdf {
  readonly name: string;
  readonly size: number;
  readonly type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface PdfToolchain {
  pageCount(path: string): Promise<number>;
  extractPage(path: string, page: number): Promise<string>;
  renderPage(path: string, page: number, workspace: string): Promise<Uint8Array>;
}

export interface PdfOcrClient {
  recognize(images: Uint8Array[], apiKey?: string): Promise<string[]>;
}

type KnowledgeVectorWriter = Pick<
  KnowledgeVectorDatabase,
  "deleteDocumentRevisions" | "upsertChunks"
>;

export class PopplerPdfToolchain implements PdfToolchain {
  constructor(
    private readonly pdfInfoBinary = process.env.PDFINFO_BINARY ?? "pdfinfo",
    private readonly pdfTextBinary = process.env.PDFTOTEXT_BINARY ?? "pdftotext",
    private readonly pdfPpmBinary = process.env.PDFTOPPM_BINARY ?? "pdftoppm",
  ) {}

  async pageCount(path: string): Promise<number> {
    const output = await runText(this.pdfInfoBinary, [path]);
    const pages = Number(output.match(/^Pages:\s+(\d+)\s*$/m)?.[1]);
    if (!Number.isInteger(pages) || pages < 1) {
      throw new Error("The PDF page count could not be determined.");
    }
    return pages;
  }

  extractPage(path: string, page: number): Promise<string> {
    return runText(this.pdfTextBinary, [
      "-f", String(page),
      "-l", String(page),
      "-layout",
      "-enc", "UTF-8",
      "-nopgbrk",
      path,
      "-",
    ]);
  }

  async renderPage(
    path: string,
    page: number,
    workspace: string,
  ): Promise<Uint8Array> {
    const outputPrefix = join(workspace, `page-${String(page).padStart(4, "0")}`);
    await runText(this.pdfPpmBinary, [
      "-f", String(page),
      "-l", String(page),
      "-r", "144",
      "-png",
      "-singlefile",
      path,
      outputPrefix,
    ]);
    return readFile(`${outputPrefix}.png`);
  }
}

export class NvidiaNemotronOcrClient implements PdfOcrClient {
  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly environment: NodeJS.ProcessEnv = process.env,
  ) {}

  async recognize(images: Uint8Array[], apiKey?: string): Promise<string[]> {
    const endpoint = this.environment.NVIDIA_OCR_ENDPOINT
      ?? "https://ai.api.nvidia.com/v1/cv/nvidia/nemotron-ocr-v2";
    const credential = apiKey
      ?? this.environment.NVIDIA_API_KEY
      ?? this.environment.NVAPI_API_KEY;
    if (new URL(endpoint).hostname.endsWith("nvidia.com") && !credential) {
      throw new Error(
        "Invalid PDF upload: this document contains scanned pages. Configure an NVIDIA NIM Provider API key, NVIDIA_API_KEY, or NVAPI_API_KEY to enable OCR.",
      );
    }
    const texts: string[] = [];
    for (let start = 0; start < images.length; start += 4) {
      const batch = images.slice(start, start + 4);
      const payload = {
        input: batch.map((image) => ({
          type: "image_url",
          url: `data:image/png;base64,${Buffer.from(image).toString("base64")}`,
        })),
        merge_levels: batch.map(() => "word"),
      };
      const response = await postOcr(this.fetchImpl, endpoint, payload, credential);
      const data = record(response)?.data;
      if (!Array.isArray(data) || data.length !== batch.length) {
        throw new Error(
          `NVIDIA OCR returned ${Array.isArray(data) ? data.length : 0} results for ${batch.length} pages.`,
        );
      }
      texts.push(...data.map(ocrText));
    }
    return texts;
  }
}

export class KnowledgePdfIngestionService {
  constructor(
    private readonly store: ProjectStore,
    private readonly vectors: KnowledgeVectorWriter,
    private readonly pdf: PdfToolchain = new PopplerPdfToolchain(),
    private readonly ocr: PdfOcrClient = new NvidiaNemotronOcrClient(),
  ) {}

  async ingest(
    sourceId: string,
    file: UploadedPdf,
    options: { nvidiaApiKey?: string } = {},
  ): Promise<KnowledgePdfIngestionResult> {
    const source = await this.store.getKnowledgeSourceDefinition(sourceId);
    if (!source || source.provider !== "postgresql") {
      throw new Error("PDF ingestion is available only for a built-in PostgreSQL Knowledge Base.");
    }
    if (source.status !== "REGISTERED") {
      throw new Error("The PostgreSQL Knowledge Base must be registered before documents can be ingested.");
    }
    if (file.size < 1 || file.size > MAX_PDF_BYTES) {
      throw new Error("Invalid PDF upload: files must be between 1 byte and 25 MiB.");
    }
    const filename = safeFilename(file.name);
    if (file.type && file.type !== "application/pdf") {
      throw new Error("Invalid PDF upload: only application/pdf files are supported.");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength < 1 || bytes.byteLength > MAX_PDF_BYTES) {
      throw new Error("Invalid PDF upload: files must be between 1 byte and 25 MiB.");
    }
    if (!Buffer.from(bytes.subarray(0, 1_024)).includes("%PDF-")) {
      throw new Error("Invalid PDF upload: the file does not contain a PDF signature.");
    }

    const contentHash = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    const documentId = `pdf-${createHash("sha256")
      .update(filename.normalize("NFKC").toLowerCase())
      .digest("hex")
      .slice(0, 24)}`;
    const workspace = await mkdtemp(join(tmpdir(), "tali-kb-pdf-"));
    const pdfPath = join(workspace, "document.pdf");
    try {
      await writeFile(pdfPath, bytes, { mode: 0o600 });
      const pageCount = await this.pdf.pageCount(pdfPath);
      if (pageCount > MAX_PDF_PAGES) {
        throw new Error(`Invalid PDF upload: PDFs may contain at most ${MAX_PDF_PAGES} pages.`);
      }

      const pages: Array<{ page: number; text: string; extraction: "pdf-text" | "nvidia-ocr" }> = [];
      const scannedPages: number[] = [];
      const scannedImages: Uint8Array[] = [];
      for (let page = 1; page <= pageCount; page += 1) {
        const text = normalizeExtractedText(await this.pdf.extractPage(pdfPath, page));
        if (printableLength(text) >= TEXT_EXTRACTION_THRESHOLD) {
          pages.push({ page, text, extraction: "pdf-text" });
        } else {
          scannedPages.push(page);
          scannedImages.push(await this.pdf.renderPage(pdfPath, page, workspace));
        }
      }

      if (scannedImages.length) {
        const recognized = await this.ocr.recognize(
          scannedImages,
          options.nvidiaApiKey,
        );
        for (const [index, page] of scannedPages.entries()) {
          const text = normalizeExtractedText(recognized[index] ?? "");
          if (!text) {
            throw new Error(`No text could be extracted from scanned page ${page}.`);
          }
          pages.push({ page, text, extraction: "nvidia-ocr" });
        }
      }
      pages.sort((left, right) => left.page - right.page);

      const chunks = pages.flatMap((page) =>
        chunkPage(page.text).map((content, index): KnowledgeVectorChunkInput => ({
          id: `${documentId}-p${String(page.page).padStart(4, "0")}-c${String(index + 1).padStart(4, "0")}`,
          content,
          filename,
          attributes: {
            content_hash: contentHash,
            document_id: documentId,
            extraction: page.extraction,
            media_type: "application/pdf",
            page_number: page.page,
          },
        }))
      );
      if (!chunks.length) {
        throw new Error("No searchable text could be extracted from this PDF.");
      }
      for (let start = 0; start < chunks.length; start += VECTOR_BATCH_SIZE) {
        await this.vectors.upsertChunks(sourceId, {
          chunks: chunks.slice(start, start + VECTOR_BATCH_SIZE),
        });
      }
      await this.vectors.deleteDocumentRevisions(sourceId, documentId, contentHash);
      return {
        documentId,
        filename,
        bytes: bytes.byteLength,
        pageCount,
        extractedPages: pageCount - scannedPages.length,
        ocrPages: scannedPages.length,
        chunks: chunks.length,
      };
    } finally {
      await rm(workspace, { force: true, recursive: true });
    }
  }
}

export function nvidiaApiKeyFromStoredProviderCredential(
  raw: string | undefined,
): string | undefined {
  if (!raw) return undefined;
  try {
    const payload = record(JSON.parse(raw));
    if (payload?.provider !== "nvidia-nim") return undefined;
    const credentials = record(payload.credentials);
    return typeof credentials?.apiKey === "string" && credentials.apiKey.trim()
      ? credentials.apiKey.trim()
      : undefined;
  } catch {
    return undefined;
  }
}

async function runText(command: string, args: string[]): Promise<string> {
  try {
    const result = await execFileAsync(command, args, {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      timeout: 120_000,
    });
    return String(result.stdout ?? "");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`PDF processing dependency ${command} is not installed.`);
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`PDF processing failed: ${detail.slice(0, 1_000)}`);
  }
}

async function postOcr(
  fetchImpl: typeof fetch,
  endpoint: string,
  payload: object,
  apiKey: string | undefined,
): Promise<unknown> {
  let detail = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120_000),
    });
    const body = await response.text();
    if (response.ok) {
      try {
        return JSON.parse(body) as unknown;
      } catch {
        throw new Error("NVIDIA OCR returned invalid JSON.");
      }
    }
    detail = `NVIDIA OCR returned ${response.status}${body ? `: ${body.slice(0, 500)}` : "."}`;
    if (response.status !== 429 && response.status < 500) break;
    await delay(500 * 2 ** attempt);
  }
  throw new Error(detail || "NVIDIA OCR request failed.");
}

function ocrText(item: unknown): string {
  const detections = record(item)?.text_detections;
  if (!Array.isArray(detections)) return "";
  const words = detections.flatMap((detection) => {
    const value = record(detection);
    const prediction = record(value?.text_prediction);
    const text = typeof prediction?.text === "string" ? prediction.text.trim() : "";
    if (!text) return [];
    const points = record(value?.bounding_box)?.points;
    const point = Array.isArray(points)
      ? record(points[0])
      : undefined;
    return [{
      text,
      x: typeof point?.x === "number" ? point.x : 0,
      y: typeof point?.y === "number" ? point.y : 0,
    }];
  }).sort((left, right) => left.y - right.y || left.x - right.x);
  const lines: Array<{ y: number; words: string[] }> = [];
  for (const word of words) {
    const line = lines.at(-1);
    if (line && Math.abs(line.y - word.y) <= 0.012) line.words.push(word.text);
    else lines.push({ y: word.y, words: [word.text] });
  }
  return lines.map((line) => line.words.join(" ")).join("\n");
}

function chunkPage(text: string, maxCharacters = 1_600, overlap = 200): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxCharacters, text.length);
    if (end < text.length) {
      const minimum = start + Math.floor(maxCharacters * 0.65);
      const candidate = text.slice(minimum, end).search(/(?:\n\n|\n|[。！？.!?]\s|\s)(?![\s\S]*(?:\n\n|\n|[。！？.!?]\s|\s))/);
      if (candidate >= 0) end = minimum + candidate + 1;
    }
    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= text.length) break;
    start = Math.max(start + 1, end - overlap);
    while (start < text.length && /\s/.test(text[start]!)) start += 1;
  }
  return chunks;
}

function normalizeExtractedText(value: string): string {
  return value
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .replace(/([\p{L}\p{N}])-\n(?=[\p{L}\p{N}])/gu, "$1")
    .replace(/[\t ]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function printableLength(value: string): number {
  return value.replace(/\s/gu, "").length;
}

function safeFilename(value: string): string {
  const name = basename(value.replaceAll("\\", "/")).trim();
  if (!name || name.length > 500 || !name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Invalid PDF upload: use a filename ending in .pdf.");
  }
  return name;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
