import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import type { VectorDatabaseDefinition, VectorDocument } from "@tali/contracts";
import {
  Activity,
  ArrowLeft,
  Braces,
  ChevronRight,
  Database,
  FileSearch,
  FileText,
  FileUp,
  RefreshCw,
  Search,
  Settings,
  Trash2,
} from "lucide-react";
import { getVectorStoreProvider, VectorStoreProviderIcon } from "@/components/knowledge/vector-store-provider";
import { DeleteEntitySheet } from "@/components/shared/delete-entity-sheet";
import { StatusDot } from "@/components/shared/status-dot";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentProjectId } from "@/hooks/use-project";
import { useProjectPermissions } from "@/hooks/use-project-permissions";
import { useProjectQueryScope } from "@/hooks/use-project-query-scope";
import { api } from "@/lib/api";
import { formatPlatformDateTime } from "@/lib/platform-preferences";

export const Route = createFileRoute("/$projectId/vector-databases/$databaseId")({
  component: VectorDatabaseDetail,
});

function VectorDatabaseDetail() {
  const { databaseId } = Route.useParams();
  const projectId = useCurrentProjectId();
  const permissions = useProjectPermissions();
  const scope = useProjectQueryScope();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [uploadKey, setUploadKey] = useState(0);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [topK, setTopK] = useState(8);
  const [deleteDatabaseOpen, setDeleteDatabaseOpen] = useState(false);
  const [deletingDocument, setDeletingDocument] = useState<VectorDocument | null>(null);
  const [notice, setNotice] = useState("");

  const overview = useQuery({
    queryKey: scope.key("vector-database", databaseId),
    queryFn: () => api.getVectorDatabase(databaseId),
    refetchInterval: (query) => query.state.data?.stats.processingDocumentCount ? 2_000 : false,
  });
  const document = useQuery({
    queryKey: scope.key("vector-document", databaseId, selectedDocumentId),
    queryFn: () => api.getVectorDocument(databaseId, selectedDocumentId),
    enabled: Boolean(selectedDocumentId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && status !== "READY" && status !== "FAILED" ? 2_000 : false;
    },
  });
  const database = overview.data?.database;
  const builtIn = database?.provider === "postgresql";

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: scope.key("vector-database", databaseId) });
    if (selectedDocumentId) {
      await queryClient.invalidateQueries({ queryKey: scope.key("vector-document", databaseId, selectedDocumentId) });
    }
  };
  const upload = useMutation({
    mutationFn: (file: File) => api.queueVectorDocument(databaseId, file),
    onSuccess: async ({ document: queued }) => {
      setUploadFile(null);
      setUploadKey((value) => value + 1);
      setSelectedDocumentId(queued.id);
      setNotice(`${queued.filename} is queued for Docling parsing and vector indexing.`);
      await refresh();
    },
  });
  const removeDocument = useMutation({
    mutationFn: (documentId: string) => api.deleteVectorDocument(databaseId, documentId),
    onSuccess: async () => {
      setSelectedDocumentId("");
      setDeletingDocument(null);
      setNotice("Vector Document and its chunks were deleted.");
      await refresh();
    },
  });
  const search = useMutation({
    mutationFn: () => api.searchVectorDatabase(databaseId, { query: searchQuery, topK }),
  });
  const reconcile = useMutation({
    mutationFn: (item: VectorDatabaseDefinition) => api.updateVectorDatabase(item.id, editableDatabase(item)),
    onSuccess: async () => { setNotice("Vector Database registration was reconciled with LiteLLM."); await refresh(); },
  });
  const removeDatabase = useMutation({
    mutationFn: () => api.deleteResource("vector-databases", databaseId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: scope.key("resource-catalog") });
      await navigate({ to: "/$projectId/vector-databases", params: { projectId } });
    },
  });

  if (overview.isPending) return <DetailSkeleton />;
  if (overview.error || !database || !overview.data) {
    return (
      <Card><CardContent className="py-14 text-center"><Database className="mx-auto size-7 text-muted-foreground" /><strong className="mt-3 block">Vector Database unavailable</strong><p className="mt-2 text-sm text-destructive">{overview.error?.message ?? "The Vector Database was not found."}</p><Button asChild variant="outline" className="mt-5"><Link to="/$projectId/vector-databases" params={{ projectId }}>Back to Vector Databases</Link></Button></CardContent></Card>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <Link to="/$projectId/vector-databases" params={{ projectId }} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2"><ArrowLeft className="size-4" />Back to Vector Databases</Link>

      <header className="grid gap-5 border-b pb-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="flex min-w-0 items-start gap-4">
          <VectorStoreProviderIcon provider={database.provider} className="size-14 [&_img]:size-8" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><h1 className="truncate text-2xl font-semibold tracking-tight">{database.name}</h1><StatusDot label={database.status} tone={database.status === "REGISTERED" ? "success" : "danger"} /></div>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{database.description}</p>
            <p className="mt-2 font-mono text-xs text-muted-foreground">{database.vectorStoreId}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-11" disabled={reconcile.isPending || !permissions.canManageResources} onClick={() => reconcile.mutate(database)}><RefreshCw />{reconcile.isPending ? "Reconciling…" : "Reconcile"}</Button>
          <Button variant="outline" className="h-11 text-destructive" disabled={!permissions.canManageResources} onClick={() => setDeleteDatabaseOpen(true)}><Trash2 />Delete</Button>
        </div>
      </header>

      {notice ? <Notice>{notice}</Notice> : null}
      {upload.error || removeDocument.error || search.error || reconcile.error ? <ErrorNotice>{(upload.error ?? removeDocument.error ?? search.error ?? reconcile.error)?.message}</ErrorNotice> : null}

      <div className="grid gap-px border bg-border sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Documents" value={overview.data.stats.documentCount} detail={`${overview.data.stats.readyDocumentCount} ready`} />
        <Metric label="Chunks" value={overview.data.stats.chunkCount} detail="active searchable vectors" />
        <Metric label="Processing" value={overview.data.stats.processingDocumentCount} detail="Docling or embedding" />
        <Metric label="Embedding" value={database.embeddingModel ?? "Provider managed"} detail={database.embeddingDimensions ? `${database.embeddingDimensions} dimensions` : getVectorStoreProvider(database.provider).label} mono />
      </div>

      <Tabs defaultValue="documents" className="gap-5">
        <div className="overflow-x-auto"><TabsList variant="line" className="min-w-max">
          <TabsTrigger value="documents"><FileText />Documents</TabsTrigger>
          <TabsTrigger value="search"><FileSearch />Search Playground</TabsTrigger>
          <TabsTrigger value="index"><Braces />Index &amp; Schema</TabsTrigger>
          <TabsTrigger value="activity"><Activity />Activity</TabsTrigger>
          <TabsTrigger value="settings"><Settings />Settings</TabsTrigger>
        </TabsList></div>

        <TabsContent value="documents" className="space-y-5">
          {builtIn ? (
            <UploadPanel allowed={permissions.canManageResources} file={uploadFile} inputKey={uploadKey} pending={upload.isPending} onFile={setUploadFile} onUpload={() => uploadFile && upload.mutate(uploadFile)} />
          ) : (
            <InfoPanel title="Provider-managed documents">This advanced Vector Database keeps its document lifecycle in {getVectorStoreProvider(database.provider).label}. TaskLattice manages registration, Project access, and recall through LiteLLM.</InfoPanel>
          )}
          <Card>
            <CardHeader className="border-b"><CardTitle>Documents</CardTitle><CardDescription>{builtIn ? "Uploaded sources and their active Docling-generated chunks." : "External providers do not expose document inventory through the built-in PGVector API."}</CardDescription></CardHeader>
            <CardContent className="px-0">
              {overview.data.documents.length ? overview.data.documents.map((item) => (
                <button key={item.id} type="button" onClick={() => setSelectedDocumentId(item.id)} className="grid min-h-20 w-full gap-3 border-b px-5 py-3 text-left last:border-b-0 hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-[-2px] sm:grid-cols-[minmax(0,1fr)_8rem_8rem_10rem_2.75rem] sm:items-center">
                  <span className="flex min-w-0 items-center gap-3"><FileText className="size-5 shrink-0 text-muted-foreground" /><span className="min-w-0"><strong className="block truncate text-sm">{item.filename}</strong><span className="mt-1 block text-xs text-muted-foreground">Revision {item.activeRevision} · {formatBytes(item.byteSize)}</span></span></span>
                  <StatusDot label={item.status} tone={documentTone(item.status)} />
                  <Fact label="Structure" value={`${item.pageCount || "—"} pages`} />
                  <Fact label="Vectors" value={`${item.chunkCount} chunks`} />
                  <span className="grid size-11 place-items-center text-muted-foreground"><ChevronRight className="size-4" /></span>
                </button>
              )) : <EmptyDocuments builtIn={builtIn} />}
            </CardContent>
          </Card>
          {selectedDocumentId ? (
            <DocumentStructure
              pending={document.isPending}
              document={document.data}
              canDelete={permissions.canManageResources}
              onDelete={() => document.data && setDeletingDocument(document.data)}
              {...(document.error ? { error: document.error.message } : {})}
            />
          ) : null}
        </TabsContent>

        <TabsContent value="search" className="space-y-5">
          <Card><CardHeader className="border-b"><CardTitle>Search Playground</CardTitle><CardDescription>Test the same Vector Database recall path exposed to Agents through LiteLLM.</CardDescription></CardHeader><CardContent className="space-y-4 pt-5">
            <Textarea aria-label="Recall query" rows={5} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="What are the main findings about multi-agent teams?" />
            <div className="flex flex-wrap items-end justify-between gap-3"><div className="w-28"><label htmlFor="search-top-k" className="mb-2 block text-xs font-medium">Top K</label><Input id="search-top-k" className="h-11" type="number" min={1} max={50} value={topK} onChange={(event) => setTopK(Number(event.target.value))} /></div><Button className="h-11" disabled={!searchQuery.trim() || search.isPending} onClick={() => search.mutate()}><Search />{search.isPending ? "Searching…" : "Run recall"}</Button></div>
          </CardContent></Card>
          {search.data ? <SearchResults result={search.data} /> : null}
        </TabsContent>

        <TabsContent value="index"><IndexSchema database={database} chunkCount={overview.data.stats.chunkCount} /></TabsContent>
        <TabsContent value="activity"><ActivityList jobs={overview.data.jobs} /></TabsContent>
        <TabsContent value="settings"><SettingsPanel database={database} canDelete={permissions.canManageResources} onDelete={() => setDeleteDatabaseOpen(true)} /></TabsContent>
      </Tabs>

      <DeleteEntitySheet open={deleteDatabaseOpen} onOpenChange={setDeleteDatabaseOpen} title="Delete Vector Database" description={<>Permanently delete <strong>{database.name}</strong>.</>} entityName={database.name} confirmLabel="Delete Vector Database" deleting={removeDatabase.isPending} onConfirm={() => removeDatabase.mutate()} {...(removeDatabase.error instanceof Error ? { error: removeDatabase.error.message } : {})} impactDescription="The LiteLLM registration, built-in documents, revisions, ingestion history, chunks, and vectors are permanently removed." />
      {deletingDocument ? <DeleteEntitySheet open onOpenChange={(open) => { if (!open) setDeletingDocument(null); }} title="Delete Vector Document" description={<>Permanently delete <strong>{deletingDocument.filename}</strong>.</>} entityName={deletingDocument.filename} confirmLabel="Delete Document" deleting={removeDocument.isPending} onConfirm={() => removeDocument.mutate(deletingDocument.id)} {...(removeDocument.error instanceof Error ? { error: removeDocument.error.message } : {})} impactDescription="All revisions and vector chunks for this document are permanently removed." /> : null}
    </div>
  );
}

function UploadPanel({ allowed, file, inputKey, pending, onFile, onUpload }: { allowed: boolean; file: File | null; inputKey: number; pending: boolean; onFile: (file: File | null) => void; onUpload: () => void }) {
  return <Card><CardContent className="grid gap-4 pt-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end"><div><div className="flex items-start gap-3"><FileUp className="mt-0.5 size-5 text-primary" /><div><strong className="text-sm">Upload Vector Document</strong><p className="mt-1 text-xs leading-5 text-muted-foreground">Docling preserves document hierarchy, tables, page provenance, and OCR text before the Project embedding model creates vectors.</p></div></div><Input key={inputKey} aria-label="Vector Document" className="mt-4 h-11" disabled={pending || !allowed} type="file" accept=".pdf,.docx,.pptx,.xlsx,.html,.htm,.md,.txt,.png,.jpg,.jpeg,.tif,.tiff" onChange={(event) => onFile(event.target.files?.[0] ?? null)} /><p className="mt-2 text-xs text-muted-foreground">PDF, Office, HTML, Markdown, text, or image · maximum 25 MiB.</p></div><Button className="h-11" disabled={!file || pending || !allowed} onClick={onUpload}><FileUp />{pending ? "Queueing…" : "Upload & index"}</Button></CardContent></Card>;
}

function DocumentStructure({ canDelete, document, pending, error, onDelete }: { canDelete: boolean; document: Awaited<ReturnType<typeof api.getVectorDocument>> | undefined; pending: boolean; error?: string; onDelete: () => void }) {
  const groups = useMemo(() => {
    const grouped = new Map<string, NonNullable<typeof document>["chunks"]>();
    for (const chunk of document?.chunks ?? []) {
      const key = chunk.sectionPath.join(" › ") || (chunk.pageNumber ? `Page ${chunk.pageNumber}` : "Document");
      grouped.set(key, [...(grouped.get(key) ?? []), chunk]);
    }
    return [...grouped.entries()];
  }, [document]);
  if (pending) return <Skeleton className="h-56 w-full" />;
  if (error) return <ErrorNotice>{error}</ErrorNotice>;
  if (!document) return null;
  return <Card><CardHeader className="border-b"><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>Document structure</CardTitle><CardDescription>{document.filename} · {document.pageCount} pages · {document.chunkCount} active chunks</CardDescription></div><Button variant="outline" className="h-11 text-destructive" disabled={!canDelete} onClick={onDelete}><Trash2 />Delete document</Button></div></CardHeader><CardContent className="space-y-3 pt-5">
    {groups.map(([section, chunks]) => <section key={section} className="border"><header className="flex items-center justify-between gap-3 border-b bg-muted/35 px-4 py-3"><strong className="text-sm">{section}</strong><span className="font-mono text-xs text-muted-foreground">{chunks.length} chunks</span></header><div>{chunks.map((chunk) => <details key={chunk.id} className="border-b last:border-b-0"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/25 focus-visible:outline-2 focus-visible:outline-offset-[-2px]"><span>Chunk {chunk.chunkIndex + 1}{chunk.pageNumber ? ` · Page ${chunk.pageNumber}` : ""}</span><span className="font-mono text-xs text-muted-foreground">{chunk.tokenCount} tokens</span></summary><div className="border-t bg-muted/15 px-4 py-4"><p className="whitespace-pre-wrap text-sm leading-6">{chunk.content}</p><p className="mt-3 font-mono text-[11px] text-muted-foreground">{chunk.id}</p></div></details>)}</div></section>)}
  </CardContent></Card>;
}

function SearchResults({ result }: { result: Awaited<ReturnType<typeof api.searchVectorDatabase>> }) {
  return <Card><CardHeader className="border-b"><CardTitle>Recall results</CardTitle><CardDescription>{result.results.length} matches in {result.durationMs} ms</CardDescription></CardHeader><CardContent className="px-0">{result.results.length ? result.results.map((item, index) => <article key={`${item.id}-${index}`} className="border-b px-5 py-4 last:border-b-0"><div className="flex flex-wrap items-center justify-between gap-3"><strong className="text-sm">{index + 1}. {item.filename}{item.pageNumber ? ` · Page ${item.pageNumber}` : ""}</strong><span className="font-mono text-xs">score {item.score.toFixed(4)}</span></div>{item.sectionPath.length ? <p className="mt-1 text-xs text-muted-foreground">{item.sectionPath.join(" › ")}</p> : null}<p className="mt-3 whitespace-pre-wrap text-sm leading-6">{item.content}</p></article>) : <div className="px-6 py-12 text-center text-sm text-muted-foreground">No chunks matched this query.</div>}</CardContent></Card>;
}

function IndexSchema({ database, chunkCount }: { database: VectorDatabaseDefinition; chunkCount: number }) {
  return <Card><CardHeader className="border-b"><CardTitle>Index &amp; Schema</CardTitle><CardDescription>Storage configuration used for recall.</CardDescription></CardHeader><CardContent className="grid gap-px bg-border p-0 sm:grid-cols-2"><SchemaFact label="Storage provider" value={getVectorStoreProvider(database.provider).label} /><SchemaFact label="Vector Database ID" value={database.vectorStoreId} mono /><SchemaFact label="Embedding model" value={database.embeddingModel ?? "Provider managed"} mono /><SchemaFact label="Dimensions" value={database.embeddingDimensions ? String(database.embeddingDimensions) : "Provider managed"} mono /><SchemaFact label="Distance" value="Cosine" /><SchemaFact label="Active chunks" value={String(chunkCount)} mono /><SchemaFact label="Document parser" value={database.provider === "postgresql" ? "Docling HybridChunker" : "Provider managed"} /><SchemaFact label="Default Top K" value={String(database.topK)} mono /></CardContent></Card>;
}

function ActivityList({ jobs }: { jobs: Awaited<ReturnType<typeof api.getVectorDatabase>>["jobs"] }) {
  return <Card><CardHeader className="border-b"><CardTitle>Ingestion activity</CardTitle><CardDescription>Durable pg-boss jobs for Docling parsing and vector generation.</CardDescription></CardHeader><CardContent className="px-0">{jobs.length ? jobs.map((job) => <div key={job.id} className="grid gap-3 border-b px-5 py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_9rem_12rem]"><div><div className="flex items-center gap-2"><StatusDot label={job.phase} tone={job.status === "COMPLETED" ? "success" : job.status === "FAILED" ? "danger" : "warning"} /><span className="font-mono text-xs text-muted-foreground">{job.id.slice(0, 8)}</span></div><p className="mt-2 text-xs text-muted-foreground">Document {job.documentId} · revision {job.revision}</p>{job.error ? <p className="mt-2 text-xs text-destructive">{job.error}</p> : null}</div><Fact label="Attempts" value={String(job.attempts)} /><div><p className="text-xs text-muted-foreground">{job.progress}%</p><Progress value={job.progress} className="mt-2" /><p className="mt-2 text-xs text-muted-foreground">{formatPlatformDateTime(job.updatedAt)}</p></div></div>) : <div className="px-6 py-14 text-center text-sm text-muted-foreground">No ingestion activity yet.</div>}</CardContent></Card>;
}

function SettingsPanel({ database, canDelete, onDelete }: { database: VectorDatabaseDefinition; canDelete: boolean; onDelete: () => void }) {
  return <div className="grid gap-5 lg:grid-cols-2"><Card><CardHeader className="border-b"><CardTitle>Provider registration</CardTitle><CardDescription>Vector Database configuration synchronized with LiteLLM.</CardDescription></CardHeader><CardContent className="space-y-4 pt-5"><SchemaFactPlain label="Name" value={database.name} /><SchemaFactPlain label="Provider" value={getVectorStoreProvider(database.provider).label} /><SchemaFactPlain label="API base" value={database.apiBase ?? (database.provider === "postgresql" ? "Internal Control bridge" : "Provider default")} /><SchemaFactPlain label="Credential" value={database.provider === "postgresql" ? "Platform managed" : database.credentialReference || "Provider workload identity"} /></CardContent></Card><Card className="border-destructive/40"><CardHeader className="border-b"><CardTitle>Danger zone</CardTitle><CardDescription>Deletion cannot be undone.</CardDescription></CardHeader><CardContent className="pt-5"><Button variant="destructive" className="h-11" disabled={!canDelete} onClick={onDelete}><Trash2 />Delete Vector Database</Button></CardContent></Card></div>;
}

function Metric({ label, value, detail, mono = false }: { label: string; value: string | number; detail: string; mono?: boolean }) { return <div className="bg-background p-4"><p className="text-xs text-muted-foreground">{label}</p><strong className={`mt-2 block truncate text-lg ${mono ? "font-mono text-sm" : ""}`}>{value}</strong><p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p></div>; }
function Fact({ label, value }: { label: string; value: string }) { return <span className="text-xs"><span className="block text-muted-foreground">{label}</span><strong className="mt-1 block">{value}</strong></span>; }
function SchemaFact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) { return <div className="bg-background p-5"><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-2 break-words text-sm font-medium ${mono ? "font-mono" : ""}`}>{value}</p></div>; }
function SchemaFactPlain({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 break-all text-sm">{value}</p></div>; }
function InfoPanel({ title, children }: { title: string; children: ReactNode }) { return <div className="border-l-2 border-primary bg-muted/25 px-4 py-3"><strong className="text-sm">{title}</strong><p className="mt-1 text-xs leading-5 text-muted-foreground">{children}</p></div>; }
function Notice({ children }: { children: ReactNode }) { return <p role="status" className="border-l-2 border-primary bg-primary/5 px-4 py-3 text-sm">{children}</p>; }
function ErrorNotice({ children }: { children: ReactNode }) { return <p role="alert" className="border-l-2 border-destructive bg-destructive/5 px-4 py-3 text-sm text-destructive">{children}</p>; }
function EmptyDocuments({ builtIn }: { builtIn: boolean }) { return <div className="px-6 py-14 text-center"><FileText className="mx-auto size-6 text-muted-foreground" /><strong className="mt-3 block">No documents</strong><p className="mt-1 text-xs text-muted-foreground">{builtIn ? "Upload a document to start Docling parsing and vector indexing." : "Manage files in the external provider console."}</p></div>; }
function DetailSkeleton() { return <div className="space-y-5"><Skeleton className="h-11 w-48" /><Skeleton className="h-28 w-full" /><Skeleton className="h-20 w-full" /><Skeleton className="h-96 w-full" /></div>; }
function formatBytes(value: number) { return value < 1024 * 1024 ? `${Math.max(1, Math.round(value / 1024))} KiB` : `${(value / 1024 / 1024).toFixed(1)} MiB`; }
function documentTone(status: VectorDocument["status"]): "success" | "danger" | "warning" | "neutral" { return status === "READY" ? "success" : status === "FAILED" ? "danger" : status === "QUEUED" ? "neutral" : "warning"; }
function editableDatabase(database: VectorDatabaseDefinition) { const { id: _id, status: _status, lastReconciliationError: _error, ...input } = database; return input; }
