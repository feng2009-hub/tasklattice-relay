import { createHash, randomUUID } from "node:crypto";
import type {
  VectorDatabaseOverview,
  VectorDocument,
  VectorDocumentDetail,
  VectorIngestionJob,
} from "@tali/contracts";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import type {
  ControlJobPublisher,
  VectorDocumentIngestionJobPayload,
} from "../jobs/control-job-queue";
import { ProjectStore } from "../projects/project-store";
import { DoclingClient, type VectorDocumentParser } from "./docling-client";
import { KnowledgeVectorDatabase } from "./knowledge-vector-database";

const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = new Set([
  "pdf", "docx", "pptx", "xlsx", "html", "htm", "md", "txt",
  "png", "jpg", "jpeg", "tif", "tiff",
]);

export interface UploadedVectorDocument {
  readonly name: string;
  readonly size: number;
  readonly type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface QueueVectorDocumentOptions {
  readonly directoryPath?: string;
}

export class VectorDocumentService {
  constructor(
    readonly store: ProjectStore,
    readonly vectors: KnowledgeVectorDatabase,
    readonly parser: VectorDocumentParser = new DoclingClient(),
    readonly db: PrismaClient = store.database(),
  ) {}

  async overview(databaseId: string): Promise<VectorDatabaseOverview> {
    const database = await this.requireDatabase(databaseId);
    if (database.provider !== "postgresql") {
      return {
        database,
        stats: emptyStats(),
        documents: [],
        jobs: [],
      };
    }
    const [documents, jobs, chunkCount] = await Promise.all([
      this.db.vectorDocument.findMany({
        where: { projectId: this.store.projectId, databaseId },
        orderBy: { updatedAt: "desc" },
      }),
      this.db.vectorIngestionJob.findMany({
        where: { projectId: this.store.projectId, databaseId },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      this.db.knowledgeVectorChunk.count({
        where: { projectId: this.store.projectId, databaseId },
      }),
    ]);
    return {
      database,
      stats: {
        documentCount: documents.length,
        readyDocumentCount: documents.filter((item) => item.status === "READY").length,
        failedDocumentCount: documents.filter((item) => item.status === "FAILED").length,
        processingDocumentCount: documents.filter((item) =>
          item.status === "QUEUED" || item.status === "PARSING" || item.status === "EMBEDDING"
        ).length,
        chunkCount,
      },
      documents: documents.map(vectorDocument),
      jobs: jobs.map(vectorIngestionJob),
    };
  }

  async document(databaseId: string, documentId: string): Promise<VectorDocumentDetail> {
    await this.requireBuiltInDatabase(databaseId);
    const document = await this.db.vectorDocument.findUnique({
      where: {
        projectId_databaseId_id: {
          projectId: this.store.projectId,
          databaseId,
          id: documentId,
        },
      },
    });
    if (!document) throw new Error("Vector Document was not found.");
    const chunks = await this.db.knowledgeVectorChunk.findMany({
      where: {
        projectId: this.store.projectId,
        databaseId,
        documentId,
        documentRevision: document.activeRevision,
      },
      orderBy: { chunkIndex: "asc" },
      take: 2_000,
    });
    return {
      ...vectorDocument(document),
      chunks: chunks.map((chunk) => ({
        id: chunk.id,
        content: chunk.content,
        pageNumber: chunk.pageNumber,
        chunkIndex: chunk.chunkIndex ?? 0,
        tokenCount: chunk.tokenCount ?? 0,
        sectionPath: chunk.sectionPath,
        label: chunk.label,
        attributes: jsonRecord(chunk.attributes),
      })),
    };
  }

  async queue(
    databaseId: string,
    file: UploadedVectorDocument,
    uploadedBy: string,
    jobs: ControlJobPublisher,
    options: QueueVectorDocumentOptions = {},
  ): Promise<{ document: VectorDocument; job: VectorIngestionJob }> {
    await this.requireBuiltInDatabase(databaseId);
    const filename = safeFilename(file.name);
    const directoryPath = safeDirectoryPath(options.directoryPath);
    validateUpload(filename, file.type, file.size);
    const bytes = new Uint8Array(await file.arrayBuffer());
    validateUpload(filename, file.type, bytes.byteLength);
    const contentHash = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    const ingestionJobId = randomUUID();
    await jobs.start();
    const queued = await this.db.$transaction(async (transaction) => {
      // Serialize uploads of the same logical document. This keeps concurrent
      // requests from allocating the same revision without locking unrelated
      // Vector Databases or filenames.
      await transaction.$queryRaw<{ locked: number }[]>`
        SELECT 1 AS locked
        FROM (
          SELECT pg_advisory_xact_lock(
            ${advisoryKey(this.store.projectId)},
            ${advisoryKey(`${databaseId}:${directoryPath}:${filename}`)}
          )
        ) AS acquired
      `;
      const current = await transaction.vectorDocument.findFirst({
        where: { projectId: this.store.projectId, databaseId, directoryPath, filename },
        orderBy: { createdAt: "desc" },
        include: {
          revisions: {
            orderBy: { revision: "desc" },
            select: { revision: true },
            take: 1,
          },
        },
      });
      const documentId = current?.id ?? documentIdentifier(`${directoryPath}/${filename}`);
      // A failed or still-pending revision does not advance activeRevision.
      const revision = (current?.revisions[0]?.revision ?? 0) + 1;
      if (current) {
        await transaction.vectorDocument.update({
          where: {
            projectId_databaseId_id: {
              projectId: this.store.projectId,
              databaseId,
              id: documentId,
            },
          },
          data: {
            byteSize: bytes.byteLength,
            error: null,
            filename,
            directoryPath,
            mediaType: file.type || mediaTypeFromFilename(filename),
            status: "QUEUED",
            uploadedBy,
          },
        });
      } else {
        await transaction.vectorDocument.create({
          data: {
            projectId: this.store.projectId,
            databaseId,
            id: documentId,
            filename,
            directoryPath,
            mediaType: file.type || mediaTypeFromFilename(filename),
            byteSize: bytes.byteLength,
            contentHash,
            status: "QUEUED",
            activeRevision: 1,
            parser: "docling",
            uploadedBy,
          },
        });
      }
      await transaction.vectorDocumentRevision.create({
        data: {
          projectId: this.store.projectId,
          databaseId,
          documentId,
          revision,
          contentHash,
          sourceBytes: bytes,
        },
      });
      await transaction.vectorIngestionJob.create({
        data: {
          id: ingestionJobId,
          projectId: this.store.projectId,
          databaseId,
          documentId,
          revision,
        },
      });
      if (!jobs.enqueueVectorDocumentIngestion) {
        throw new Error("The Control Worker queue does not support Vector Document ingestion.");
      }
      const queueJobId = await jobs.enqueueVectorDocumentIngestion(
        { projectId: this.store.projectId, databaseId, ingestionJobId },
        transaction,
      );
      await transaction.vectorIngestionJob.update({
        where: { id: ingestionJobId },
        data: { queueJobId },
      });
      return { documentId, revision };
    });
    const [document, job] = await Promise.all([
      this.db.vectorDocument.findUniqueOrThrow({
        where: { projectId_databaseId_id: { projectId: this.store.projectId, databaseId, id: queued.documentId } },
      }),
      this.db.vectorIngestionJob.findUniqueOrThrow({ where: { id: ingestionJobId } }),
    ]);
    return { document: vectorDocument(document), job: vectorIngestionJob(job) };
  }

  async process(payload: VectorDocumentIngestionJobPayload, retryCount = 0): Promise<void> {
    const job = await this.db.vectorIngestionJob.findFirst({
      where: { id: payload.ingestionJobId, projectId: this.store.projectId, databaseId: payload.databaseId },
      include: { document: true, revisionRecord: true },
    });
    if (!job || job.status === "COMPLETED") return;
    if (!job.revisionRecord.sourceBytes) {
      throw new Error("The queued Vector Document source is no longer available.");
    }
    await this.updateProgress(payload.databaseId, job.id, job.documentId, {
      status: "RUNNING",
      phase: "PARSING",
      progress: 10,
      attempts: retryCount + 1,
      startedAt: new Date(),
      completedAt: null,
      error: null,
    }, { status: "PARSING", error: null });
    try {
      const parsed = await this.parser.parse({
        bytes: job.revisionRecord.sourceBytes,
        filename: job.document.filename,
        mediaType: job.document.mediaType,
      });
      await this.updateProgress(payload.databaseId, job.id, job.documentId, {
        phase: "EMBEDDING",
        progress: 55,
      }, { status: "EMBEDDING" });
      await this.vectors.replaceDocumentChunks(payload.databaseId, {
        contentHash: job.revisionRecord.contentHash,
        documentId: job.documentId,
        filename: job.document.filename,
        revision: job.revision,
        chunks: parsed.chunks,
      });
      await this.updateProgress(payload.databaseId, job.id, job.documentId, {
        phase: "FINALIZING",
        progress: 90,
      });
      await this.db.$transaction([
        this.db.knowledgeVectorChunk.deleteMany({
          where: {
            projectId: this.store.projectId,
            databaseId: payload.databaseId,
            documentId: job.documentId,
            documentRevision: { not: job.revision },
          },
        }),
        this.db.vectorDocumentRevision.update({
          where: {
            projectId_databaseId_documentId_revision: {
              projectId: this.store.projectId,
              databaseId: payload.databaseId,
              documentId: job.documentId,
              revision: job.revision,
            },
          },
          data: {
            completedAt: new Date(),
            ...(parsed.document === null
              ? {}
              : { doclingDocument: parsed.document as Prisma.InputJsonValue }),
            sourceBytes: null,
          },
        }),
        this.db.vectorDocument.update({
          where: {
            projectId_databaseId_id: {
              projectId: this.store.projectId,
              databaseId: payload.databaseId,
              id: job.documentId,
            },
          },
          data: {
            activeRevision: job.revision,
            chunkCount: parsed.chunks.length,
            contentHash: job.revisionRecord.contentHash,
            error: null,
            ocrPageCount: parsed.ocrPageCount,
            pageCount: parsed.pageCount,
            status: "READY",
          },
        }),
        this.db.vectorIngestionJob.update({
          where: { id: job.id },
          data: {
            completedAt: new Date(),
            error: null,
            phase: "COMPLETED",
            progress: 100,
            status: "COMPLETED",
          },
        }),
      ]);
    } catch (error) {
      const message = safeError(error);
      await this.updateProgress(payload.databaseId, job.id, job.documentId, {
        completedAt: new Date(),
        error: message,
        phase: "FAILED",
        status: "FAILED",
      }, { error: message, status: "FAILED" });
      throw error;
    }
  }

  async delete(databaseId: string, documentId: string): Promise<boolean> {
    await this.requireBuiltInDatabase(databaseId);
    const deleted = await this.db.vectorDocument.deleteMany({
      where: { projectId: this.store.projectId, databaseId, id: documentId },
    });
    return deleted.count > 0;
  }

  private async updateProgress(
    databaseId: string,
    jobId: string,
    documentId: string,
    job: Prisma.VectorIngestionJobUpdateManyMutationInput,
    document?: Prisma.VectorDocumentUpdateManyMutationInput,
  ): Promise<void> {
    await this.db.$transaction([
      this.db.vectorIngestionJob.updateMany({
        where: { id: jobId, projectId: this.store.projectId, databaseId },
        data: job,
      }),
      ...(document ? [this.db.vectorDocument.updateMany({
        where: { projectId: this.store.projectId, databaseId, id: documentId },
        data: document,
      })] : []),
    ]);
  }

  private async requireDatabase(databaseId: string) {
    const database = await this.store.getKnowledgeSourceDefinition(databaseId);
    if (!database) throw new Error("Vector Database was not found.");
    return database;
  }

  private async requireBuiltInDatabase(databaseId: string) {
    const database = await this.requireDatabase(databaseId);
    if (database.provider !== "postgresql") {
      throw new Error("Document ingestion is available only for the built-in PostgreSQL Vector Database.");
    }
    if (database.status !== "REGISTERED") {
      throw new Error("The built-in Vector Database must be registered before documents can be ingested.");
    }
    return database;
  }
}

function vectorDocument(document: {
  id: string;
  databaseId: string;
  filename: string;
  directoryPath: string;
  mediaType: string;
  byteSize: number;
  contentHash: string;
  status: string;
  activeRevision: number;
  pageCount: number;
  chunkCount: number;
  ocrPageCount: number;
  parser: string;
  uploadedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  error: string | null;
}): VectorDocument {
  return {
    id: document.id,
    databaseId: document.databaseId,
    filename: document.filename,
    directoryPath: document.directoryPath,
    mediaType: document.mediaType,
    byteSize: document.byteSize,
    contentHash: document.contentHash,
    status: document.status as VectorDocument["status"],
    activeRevision: document.activeRevision,
    pageCount: document.pageCount,
    chunkCount: document.chunkCount,
    ocrPageCount: document.ocrPageCount,
    parser: "docling",
    uploadedBy: document.uploadedBy,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
    error: document.error,
  };
}

function vectorIngestionJob(job: {
  id: string;
  databaseId: string;
  documentId: string;
  revision: number;
  status: string;
  phase: string;
  progress: number;
  attempts: number;
  error: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  updatedAt: Date;
}): VectorIngestionJob {
  return {
    id: job.id,
    databaseId: job.databaseId,
    documentId: job.documentId,
    revision: job.revision,
    status: job.status as VectorIngestionJob["status"],
    phase: job.phase as VectorIngestionJob["phase"],
    progress: job.progress,
    attempts: job.attempts,
    error: job.error,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    updatedAt: job.updatedAt.toISOString(),
  };
}

function emptyStats() {
  return {
    documentCount: 0,
    readyDocumentCount: 0,
    chunkCount: 0,
    failedDocumentCount: 0,
    processingDocumentCount: 0,
  };
}

function safeFilename(raw: string): string {
  const value = raw.normalize("NFKC").replace(/[\\/\0]/g, "_").trim();
  if (!value) throw new Error("The uploaded Vector Document needs a filename.");
  return value.slice(0, 500);
}

function safeDirectoryPath(raw = "/"): string {
  const segments = raw
    .normalize("NFKC")
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === ".." || segment.includes("\0"))) {
    throw new Error("The Vector Document directory path is invalid.");
  }
  const path = segments.length ? `/${segments.join("/")}` : "/";
  if (path.length > 2_000) throw new Error("The Vector Document directory path is too long.");
  return path;
}

function validateUpload(filename: string, mediaType: string, size: number): void {
  if (size < 1 || size > MAX_DOCUMENT_BYTES) {
    throw new Error("Vector Documents must be between 1 byte and 25 MiB.");
  }
  const extension = filename.toLowerCase().split(".").pop() ?? "";
  if (!ACCEPTED_EXTENSIONS.has(extension) && !mediaType.startsWith("image/")) {
    throw new Error("Unsupported Vector Document. Upload PDF, Office, HTML, Markdown, text, or an image.");
  }
}

function documentIdentifier(filename: string): string {
  const slug = filename
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "document";
  return `${slug}-${randomUUID().slice(0, 8)}`;
}

function advisoryKey(value: string): number {
  return createHash("sha256").update(value).digest().readInt32BE(0);
}

function mediaTypeFromFilename(filename: string): string {
  const extension = filename.toLowerCase().split(".").pop();
  const types: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    html: "text/html",
    htm: "text/html",
    md: "text/markdown",
    txt: "text/plain",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    tif: "image/tiff",
    tiff: "image/tiff",
  };
  return extension ? types[extension] ?? "application/octet-stream" : "application/octet-stream";
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 4_000);
}
