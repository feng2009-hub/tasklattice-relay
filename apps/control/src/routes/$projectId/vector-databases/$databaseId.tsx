import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Tree, type NodeRendererProps, type RowRendererProps, type TreeApi } from "react-arborist";
import type {
  VectorDatabaseDefinition,
  VectorDocument,
  VectorDocumentChunk,
  VectorDocumentDetail,
} from "@tali/contracts";
import {
  Activity,
  ArrowLeft,
  Braces,
  ChevronDown,
  ChevronRight,
  Database,
  FileSearch,
  FileText,
  FileUp,
  Folder,
  FolderOpen,
  Layers3,
  LockKeyhole,
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentProjectId } from "@/hooks/use-project";
import { useProjectPermissions } from "@/hooks/use-project-permissions";
import { useProjectQueryScope } from "@/hooks/use-project-query-scope";
import { api } from "@/lib/api";
import { formatPlatformDateTime } from "@/lib/platform-preferences";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/$projectId/vector-databases/$databaseId")({
  component: VectorDatabaseDetail,
});

type ExplorerSelection =
  | { kind: "directory"; path: string }
  | { kind: "document"; documentId: string }
  | { kind: "structure"; documentId: string }
  | { kind: "group"; documentId: string; groupKey: string }
  | { kind: "chunk"; documentId: string; groupKey: string; chunkId: string };

interface UploadCandidate {
  file: File;
  relativePath: string;
}

interface DocumentGroup {
  key: string;
  label: string;
  context: string;
  kind: "page" | "section" | "document";
  chunks: VectorDocumentChunk[];
}

type ExplorerTreeNode =
  | { id: string; kind: "directory"; name: string; path: string; meta: string; children: ExplorerTreeNode[] }
  | { id: string; kind: "document"; name: string; document: VectorDocument; children?: ExplorerTreeNode[] }
  | { id: string; kind: "structure"; name: string; documentId: string; meta: string; children: ExplorerTreeNode[] }
  | { id: string; kind: "group"; name: string; documentId: string; group: DocumentGroup; meta: string }
  | { id: string; kind: "hint"; name: string; tone?: "danger" | "locked" };

function VectorDatabaseDetail() {
  const { databaseId } = Route.useParams();
  const projectId = useCurrentProjectId();
  const permissions = useProjectPermissions();
  const scope = useProjectQueryScope();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [selection, setSelection] = useState<ExplorerSelection>({ kind: "directory", path: "/" });
  const [workspaceTab, setWorkspaceTab] = useState("details");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadKey, setUploadKey] = useState(0);
  const [uploadFiles, setUploadFiles] = useState<UploadCandidate[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [topK, setTopK] = useState(8);
  const [deleteDatabaseOpen, setDeleteDatabaseOpen] = useState(false);
  const [deletingDocument, setDeletingDocument] = useState<VectorDocument | null>(null);
  const [notice, setNotice] = useState("");
  const [explorerDocumentDetails, setExplorerDocumentDetails] = useState<Record<string, VectorDocumentDetail>>({});
  const [explorerLoadingDocumentIds, setExplorerLoadingDocumentIds] = useState<Set<string>>(() => new Set());
  const [explorerDocumentErrors, setExplorerDocumentErrors] = useState<Record<string, string>>({});
  const selectedDocumentId = "documentId" in selection ? selection.documentId : "";

  const overview = useQuery({
    queryKey: scope.key("vector-database", databaseId),
    queryFn: () => api.getVectorDatabase(databaseId),
    refetchInterval: (query) => query.state.data?.stats.processingDocumentCount ? 2_000 : false,
  });
  const document = useQuery({
    queryKey: scope.key("vector-document", databaseId, selectedDocumentId),
    queryFn: () => api.getVectorDocument(databaseId, selectedDocumentId),
    enabled: Boolean(
      selectedDocumentId
      && permissions.canViewVectorDatabaseContent
    ),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && status !== "READY" && status !== "FAILED" ? 2_000 : false;
    },
  });
  const database = overview.data?.database;
  const builtIn = database?.provider === "postgresql";
  const uploadDestination = selection.kind === "directory"
    ? selection.path
    : overviewDocumentDirectory(selection, overview.data?.documents ?? []);
  const groups = useMemo(() => buildDocumentGroups(document.data?.chunks ?? []), [document.data?.chunks]);
  const contentLocked = !permissions.canViewVectorDatabaseContent || isAccessDenied(document.error);

  useEffect(() => {
    if (!document.data) return;
    setExplorerDocumentDetails((current) => current[document.data.id] === document.data
      ? current
      : { ...current, [document.data.id]: document.data });
  }, [document.data]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: scope.key("vector-database", databaseId) });
    if (selectedDocumentId && permissions.canViewVectorDatabaseContent) {
      await queryClient.invalidateQueries({ queryKey: scope.key("vector-document", databaseId, selectedDocumentId) });
    }
  };
  const upload = useMutation({
    mutationFn: async ({ files, destination }: { files: UploadCandidate[]; destination: string }) => {
      const queued = [];
      for (const candidate of files) {
        queued.push(await api.queueVectorDocument(
          databaseId,
          candidate.file,
          joinDirectoryPath(destination, parentPath(candidate.relativePath)),
        ));
      }
      return queued;
    },
    onSuccess: async (queued) => {
      setUploadFiles([]);
      setUploadKey((value) => value + 1);
      setUploadOpen(false);
      setSelection({ kind: "directory", path: uploadDestination });
      setNotice(`${queued.length} ${queued.length === 1 ? "file is" : "files are"} queued for Docling parsing and vector indexing.`);
      await refresh();
    },
  });
  const removeDocument = useMutation({
    mutationFn: (documentId: string) => api.deleteVectorDocument(databaseId, documentId),
    onSuccess: async () => {
      setSelection({ kind: "directory", path: deletingDocument?.directoryPath ?? "/" });
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

  const selectDocument = (item: VectorDocument) => {
    setSelection({ kind: "document", documentId: item.id });
    setWorkspaceTab("details");
  };
  const selectStructure = (documentId: string) => {
    setSelection({ kind: "structure", documentId });
    setWorkspaceTab("details");
  };
  const selectGroup = (documentId: string, group: DocumentGroup) => {
    setSelection({ kind: "group", documentId, groupKey: group.key });
    setWorkspaceTab("details");
  };
  const selectChunk = (group: DocumentGroup, chunk: VectorDocumentChunk) => {
    setSelection({ kind: "chunk", documentId: selectedDocumentId, groupKey: group.key, chunkId: chunk.id });
    setWorkspaceTab("details");
  };
  const navigateExplorer = (next: ExplorerSelection) => {
    setSelection(next);
    setWorkspaceTab("details");
  };
  const loadExplorerDocument = async (documentId: string) => {
    if (
      !permissions.canViewVectorDatabaseContent
      || explorerDocumentDetails[documentId]
      || explorerLoadingDocumentIds.has(documentId)
    ) return;
    setExplorerLoadingDocumentIds((current) => new Set(current).add(documentId));
    setExplorerDocumentErrors((current) => {
      const next = { ...current };
      delete next[documentId];
      return next;
    });
    try {
      const detail = await queryClient.fetchQuery({
        queryKey: scope.key("vector-document", databaseId, documentId),
        queryFn: () => api.getVectorDocument(databaseId, documentId),
      });
      setExplorerDocumentDetails((current) => ({ ...current, [documentId]: detail }));
    } catch (error) {
      setExplorerDocumentErrors((current) => ({ ...current, [documentId]: errorMessage(error) }));
    } finally {
      setExplorerLoadingDocumentIds((current) => {
        const next = new Set(current);
        next.delete(documentId);
        return next;
      });
    }
  };

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
          <Button variant="outline" className="h-11" disabled={reconcile.isPending || !permissions.canUpdateVectorDatabases} onClick={() => reconcile.mutate(database)}><RefreshCw />{reconcile.isPending ? "Reconciling…" : "Reconcile"}</Button>
        </div>
      </header>

      {notice ? <Notice>{notice}</Notice> : null}
      {removeDocument.error || search.error || reconcile.error ? <ErrorNotice>{errorMessage(removeDocument.error ?? search.error ?? reconcile.error)}</ErrorNotice> : null}

      <div className="grid min-h-[42rem] overflow-hidden border bg-background lg:grid-cols-[19rem_minmax(0,1fr)]">
        <ExplorerSidebar
          documents={overview.data.documents}
          selection={selection}
          documentDetails={explorerDocumentDetails}
          loadingDocumentIds={explorerLoadingDocumentIds}
          documentErrors={explorerDocumentErrors}
          contentLocked={contentLocked}
          builtIn={builtIn}
          canUpload={permissions.canUpdateVectorDatabases}
          onNavigate={navigateExplorer}
          onSelectDocument={selectDocument}
          onSelectStructure={selectStructure}
          onSelectGroup={selectGroup}
          onLoadDocument={(documentId) => { void loadExplorerDocument(documentId); }}
          onUploadFiles={(files) => { upload.reset(); setUploadFiles(files); setUploadKey((value) => value + 1); setUploadOpen(true); }}
        />

        <Tabs value={workspaceTab} onValueChange={setWorkspaceTab} className="min-w-0 gap-0">
          <div className="overflow-x-auto border-b px-4"><TabsList variant="line" className="min-w-max">
            <TabsTrigger value="details"><FileText />Details</TabsTrigger>
            <TabsTrigger value="search"><FileSearch />Search Playground</TabsTrigger>
            <TabsTrigger value="index"><Braces />Index &amp; Schema</TabsTrigger>
            <TabsTrigger value="activity"><Activity />Activity</TabsTrigger>
            <TabsTrigger value="settings"><Settings />Settings</TabsTrigger>
          </TabsList></div>

          <TabsContent value="details" className="m-0">
            <ExplorerContent
              database={database}
              documents={overview.data.documents}
              selection={selection}
              document={document.data}
              groups={groups}
              documentPending={document.isFetching}
              documentError={document.error}
              contentLocked={contentLocked}
              canDeleteDocument={permissions.canUpdateVectorDatabases}
              onNavigate={navigateExplorer}
              onSelectDocument={selectDocument}
              onSelectGroup={(group) => selectGroup(selectedDocumentId, group)}
              onSelectChunk={selectChunk}
              onDeleteDocument={(item) => setDeletingDocument(item)}
            />
          </TabsContent>

        <TabsContent value="search" className="space-y-5 p-5">
          <Card><CardHeader className="border-b"><CardTitle>Search Playground</CardTitle><CardDescription>Test the same Vector Database recall path exposed to Agents through LiteLLM.</CardDescription></CardHeader><CardContent className="space-y-4 pt-5">
            {permissions.canViewVectorDatabaseContent ? <><Textarea aria-label="Recall query" rows={5} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="What are the main findings about multi-agent teams?" />
            <div className="flex flex-wrap items-end justify-between gap-3"><div className="w-28"><label htmlFor="search-top-k" className="mb-2 block text-xs font-medium">Top K</label><Input id="search-top-k" className="h-11" type="number" min={1} max={50} value={topK} onChange={(event) => setTopK(Number(event.target.value))} /></div><Button className="h-11" disabled={!searchQuery.trim() || search.isPending} onClick={() => search.mutate()}><Search />{search.isPending ? "Searching…" : "Run recall"}</Button></div></> : <LockedContent />}
          </CardContent></Card>
          {search.data ? <SearchResults result={search.data} /> : null}
        </TabsContent>

          <TabsContent value="index" className="p-5"><IndexSchema database={database} chunkCount={overview.data.stats.chunkCount} /></TabsContent>
          <TabsContent value="activity" className="p-5"><ActivityList jobs={overview.data.jobs} /></TabsContent>
          <TabsContent value="settings" className="p-5"><SettingsPanel database={database} canDelete={permissions.canDeleteVectorDatabases} onDelete={() => setDeleteDatabaseOpen(true)} /></TabsContent>
        </Tabs>
      </div>

      <UploadDocumentSheet open={uploadOpen} allowed={permissions.canUpdateVectorDatabases} files={uploadFiles} destinationPath={uploadDestination} inputKey={uploadKey} pending={upload.isPending} error={upload.error} onOpenChange={(open) => { if (!upload.isPending) setUploadOpen(open); }} onFiles={setUploadFiles} onUpload={() => uploadFiles.length && upload.mutate({ files: uploadFiles, destination: uploadDestination })} />
      <DeleteEntitySheet open={deleteDatabaseOpen} onOpenChange={setDeleteDatabaseOpen} title="Delete Vector Database" description={<>Permanently delete <strong>{database.name}</strong>.</>} entityName={database.name} confirmLabel="Delete Vector Database" deleting={removeDatabase.isPending} onConfirm={() => removeDatabase.mutate()} {...(removeDatabase.error instanceof Error ? { error: removeDatabase.error.message } : {})} impactDescription="The LiteLLM registration, built-in documents, revisions, ingestion history, chunks, and vectors are permanently removed." />
      {deletingDocument ? <DeleteEntitySheet open onOpenChange={(open) => { if (!open) setDeletingDocument(null); }} title="Delete Vector Document" description={<>Permanently delete <strong>{deletingDocument.filename}</strong>.</>} entityName={deletingDocument.filename} confirmLabel="Delete Document" deleting={removeDocument.isPending} onConfirm={() => removeDocument.mutate(deletingDocument.id)} {...(removeDocument.error instanceof Error ? { error: removeDocument.error.message } : {})} impactDescription="All revisions and vector chunks for this document are permanently removed." /> : null}
    </div>
  );
}

function ExplorerSidebar({ documents, selection, documentDetails, loadingDocumentIds, documentErrors, contentLocked, builtIn, canUpload, onNavigate, onSelectDocument, onSelectStructure, onSelectGroup, onLoadDocument, onUploadFiles }: {
  documents: VectorDocument[];
  selection: ExplorerSelection;
  documentDetails: Record<string, VectorDocumentDetail>;
  loadingDocumentIds: Set<string>;
  documentErrors: Record<string, string>;
  contentLocked: boolean;
  builtIn: boolean;
  canUpload: boolean;
  onNavigate: (selection: ExplorerSelection) => void;
  onSelectDocument: (document: VectorDocument) => void;
  onSelectStructure: (documentId: string) => void;
  onSelectGroup: (documentId: string, group: DocumentGroup) => void;
  onLoadDocument: (documentId: string) => void;
  onUploadFiles: (files: UploadCandidate[]) => void;
}) {
  const treeRef = useRef<TreeApi<ExplorerTreeNode> | undefined>(undefined);
  const [treeContainerRef, treeHeight] = useElementHeight(384);
  const [dragActive, setDragActive] = useState(false);
  const selectedNodeId = explorerSelectionNodeId(selection);
  const treeData = useMemo(() => buildExplorerTree(
    documents,
    documentDetails,
    loadingDocumentIds,
    documentErrors,
    contentLocked,
  ), [contentLocked, documentDetails, documentErrors, documents, loadingDocumentIds]);

  useEffect(() => {
    treeRef.current?.openParents(selectedNodeId);
  }, [selectedNodeId, treeData]);

  const handleDrop = async (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragActive(false);
    if (!builtIn || !canUpload) return;
    const files = await collectDroppedFiles(event.dataTransfer);
    if (files.length) onUploadFiles(files);
  };
  const activateNode = (data: ExplorerTreeNode) => {
    if (data.kind === "directory") onNavigate({ kind: "directory", path: data.path });
    if (data.kind === "document") onSelectDocument(data.document);
    if (data.kind === "structure") onSelectStructure(data.documentId);
    if (data.kind === "group") onSelectGroup(data.documentId, data.group);
  };

  return <aside
    className={cn("flex min-h-[32rem] min-w-0 flex-col border-b bg-muted/10 transition-colors lg:min-h-0 lg:border-r lg:border-b-0", dragActive && "bg-primary/5 ring-2 ring-inset ring-primary/40")}
    onDragEnter={(event) => { event.preventDefault(); if (builtIn && canUpload) setDragActive(true); }}
    onDragLeave={(event) => { if (event.currentTarget === event.target) setDragActive(false); }}
    onDragOver={(event) => event.preventDefault()}
    onDrop={handleDrop}
  >
    <header className="flex min-h-20 items-center justify-between gap-3 border-b px-4 py-3">
      <div className="min-w-0"><h2 className="text-sm font-semibold">Explorer</h2><p className="mt-1 truncate text-[11px] text-muted-foreground" title={displayDirectory(overviewDocumentDirectory(selection, documents))}>Upload to: <span className="font-mono text-foreground">{displayDirectory(overviewDocumentDirectory(selection, documents))}</span></p></div>
      {builtIn ? <Button size="sm" className="h-11 shrink-0" disabled={!canUpload} onClick={() => onUploadFiles([])}><FileUp />Upload</Button> : null}
    </header>
    <div ref={treeContainerRef} className="h-96 min-h-0 flex-1 overflow-hidden py-2 lg:h-auto">
      <Tree<ExplorerTreeNode>
        ref={treeRef}
        data={treeData}
        width="100%"
        height={treeHeight}
        rowHeight={44}
        indent={16}
        overscanCount={4}
        openByDefault={false}
        initialOpenState={{ "directory:/": true }}
        selection={selectedNodeId}
        selectionFollowsFocus={false}
        disableMultiSelection
        disableDeselectOnClick
        disableSelect={(data) => data.kind === "hint"}
        disableDrag
        disableDrop
        disableEdit
        aria-label="Vector Database Explorer"
        renderRow={ExplorerArboristRow}
        onActivate={(node) => activateNode(node.data)}
        onToggle={(id) => {
          if (id.startsWith("structure:")) onLoadDocument(id.slice("structure:".length));
        }}
      >
        {ExplorerArboristNode}
      </Tree>
    </div>
    {builtIn && canUpload ? <p className="border-t px-4 py-3 text-center text-[11px] leading-4 text-muted-foreground">Drop files or folders anywhere in Explorer</p> : null}
  </aside>;
}

function ExplorerArboristRow({ node, attrs, innerRef, children }: RowRendererProps<ExplorerTreeNode>) {
  return <div
    {...attrs}
    ref={innerRef}
    className={cn(attrs.className, "min-w-full outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring")}
    onFocus={(event) => event.stopPropagation()}
    onClick={node.handleClick}
  >{children}</div>;
}

function ExplorerArboristNode({ node, style }: NodeRendererProps<ExplorerTreeNode>) {
  const data = node.data;
  const icon = data.kind === "directory"
    ? node.isOpen ? <FolderOpen /> : <Folder />
    : data.kind === "document"
      ? <FileText />
      : data.kind === "hint" && data.tone === "locked"
        ? <LockKeyhole />
        : <Layers3 />;
  const meta = data.kind === "document" || data.kind === "hint" ? undefined : data.meta;
  return <div
    style={style}
    className={cn(
      "flex h-11 min-w-0 items-center gap-1 rounded-sm pr-2 text-sm hover:bg-muted/70",
      node.isSelected && "bg-primary/10 text-primary hover:bg-primary/10",
      data.kind === "hint" && "text-xs text-muted-foreground hover:bg-transparent",
      data.kind === "hint" && data.tone === "danger" && "text-destructive",
    )}
    title={data.name}
  >
    {node.isInternal ? <span
      aria-hidden
      className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
      onClick={(event) => { event.stopPropagation(); node.toggle(); }}
    >{node.isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</span> : <span aria-hidden className="size-9 shrink-0" />}
    <span aria-hidden className="shrink-0 [&_svg]:size-4">{icon}</span>
    <span className="min-w-0 flex-1 truncate font-medium">{data.name}</span>
    {data.kind === "document" ? <ExplorerDocumentStatus status={data.document.status} /> : null}
    {meta ? <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{meta}</span> : null}
  </div>;
}

function ExplorerDocumentStatus({ status }: { status: VectorDocument["status"] }) {
  return <span className="shrink-0" title={status} aria-label={status}>
    <span className={cn(
      "block size-2 rounded-full",
      status === "READY" && "bg-emerald-500",
      status === "FAILED" && "bg-destructive",
      status !== "READY" && status !== "FAILED" && "bg-amber-500",
    )} />
  </span>;
}

function ExplorerContent({ database, documents, selection, document, groups, documentPending, documentError, contentLocked, canDeleteDocument, onNavigate, onSelectDocument, onSelectGroup, onSelectChunk, onDeleteDocument }: {
  database: VectorDatabaseDefinition;
  documents: VectorDocument[];
  selection: ExplorerSelection;
  document: VectorDocumentDetail | undefined;
  groups: DocumentGroup[];
  documentPending: boolean;
  documentError: Error | null;
  contentLocked: boolean;
  canDeleteDocument: boolean;
  onNavigate: (selection: ExplorerSelection) => void;
  onSelectDocument: (document: VectorDocument) => void;
  onSelectGroup: (group: DocumentGroup) => void;
  onSelectChunk: (group: DocumentGroup, chunk: VectorDocumentChunk) => void;
  onDeleteDocument: (document: VectorDocument) => void;
}) {
  const documentId = "documentId" in selection ? selection.documentId : "";
  const summary = documents.find((item) => item.id === documentId);
  const group = "groupKey" in selection ? groups.find((item) => item.key === selection.groupKey) : undefined;
  const chunk = selection.kind === "chunk" ? group?.chunks.find((item) => item.id === selection.chunkId) : undefined;
  return <section className="min-h-[38rem] overflow-hidden bg-background">
    <div className="flex min-h-14 flex-wrap items-center gap-3 border-b px-4 py-2 sm:px-5">
      <BrowserBreadcrumb selection={selection} document={summary} group={group} chunk={chunk} onNavigate={onNavigate} />
    </div>
    {selection.kind === "directory" ? <DirectoryBrowser path={selection.path} documents={documents} builtIn={database.provider === "postgresql"} onOpenDirectory={(path) => onNavigate({ kind: "directory", path })} onOpenDocument={onSelectDocument} /> : null}
    {selection.kind !== "directory" && !summary ? <InspectorEmpty title="File unavailable">The selected file is no longer part of this Vector Database.</InspectorEmpty> : null}
    {selection.kind === "document" && summary ? <FileInspector database={database} document={summary} pending={documentPending} error={documentError} contentLocked={contentLocked} canDelete={canDeleteDocument} onDelete={() => onDeleteDocument(summary)} /> : null}
    {selection.kind === "structure" && summary ? <StructureInspector document={summary} groups={groups} pending={documentPending} error={documentError} contentLocked={contentLocked} /> : null}
    {selection.kind === "group" && summary && group ? <GroupInspector document={summary} group={group} onSelectChunk={(item) => onSelectChunk(group, item)} /> : null}
    {selection.kind === "group" && summary && !group && documentPending ? <InspectorEmpty title="Loading indexed page">The page structure is being loaded.</InspectorEmpty> : null}
    {selection.kind === "chunk" && summary && group && chunk ? <ChunkInspector document={summary} group={group} chunk={chunk} /> : null}
  </section>;
}

function BrowserBreadcrumb({ selection, document, group, chunk, onNavigate }: { selection: ExplorerSelection; document: VectorDocument | undefined; group: DocumentGroup | undefined; chunk: VectorDocumentChunk | undefined; onNavigate: (selection: ExplorerSelection) => void }) {
  const directoryPath = selection.kind === "directory" ? selection.path : document?.directoryPath ?? "/";
  const segments = pathSegments(directoryPath);
  return <nav aria-label="Explorer path" className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
    <button type="button" className="min-h-10 rounded-sm px-2 font-semibold hover:bg-muted" onClick={() => onNavigate({ kind: "directory", path: "/" })}>Documents</button>
    {segments.map((segment, index) => <span key={`${segment}-${index}`} className="contents"><ChevronRight className="size-4 shrink-0 text-muted-foreground" /><button type="button" className="min-h-10 max-w-48 truncate rounded-sm px-2 font-medium hover:bg-muted" onClick={() => onNavigate({ kind: "directory", path: `/${segments.slice(0, index + 1).join("/")}` })}>{segment}</button></span>)}
    {document ? <><ChevronRight className="size-4 shrink-0 text-muted-foreground" /><button type="button" className="min-h-10 max-w-72 truncate rounded-sm px-2 font-medium hover:bg-muted" onClick={() => onNavigate({ kind: "document", documentId: document.id })}>{document.filename}</button></> : null}
    {selection.kind === "structure" && document ? <><ChevronRight className="size-4 shrink-0 text-muted-foreground" /><span className="px-2 font-medium">{document.pageCount ? "Pages" : "Indexed content"}</span></> : null}
    {group && document ? <><ChevronRight className="size-4 shrink-0 text-muted-foreground" /><button type="button" className="min-h-10 rounded-sm px-2 font-medium hover:bg-muted" onClick={() => onNavigate({ kind: "group", documentId: document.id, groupKey: group.key })}>{group.label}</button></> : null}
    {chunk ? <><ChevronRight className="size-4 shrink-0 text-muted-foreground" /><span className="px-2 font-medium">Chunk {chunk.chunkIndex + 1}</span></> : null}
  </nav>;
}

function DirectoryBrowser({ path, documents, builtIn, onOpenDirectory, onOpenDocument }: { path: string; documents: VectorDocument[]; builtIn: boolean; onOpenDirectory: (path: string) => void; onOpenDocument: (document: VectorDocument) => void }) {
  const folders = directChildDirectories(documents, path);
  const files = documents.filter((document) => document.directoryPath === path);
  if (!folders.length && !files.length) return <EmptyDocuments builtIn={builtIn} />;
  return <div>
    <BrowserRowsHeader name="Name" description={`${folders.length} folders · ${files.length} files`} columns />
    {folders.map((folder) => <BrowserRow key={folder.path} icon={<Folder />} name={folder.name} detail="Directory" type="Folder" meta={`${folder.documentCount} files`} onOpen={() => onOpenDirectory(folder.path)} />)}
    {files.map((document) => <BrowserRow key={document.id} icon={<FileText />} name={document.filename} detail={`Revision ${document.activeRevision} · ${formatBytes(document.byteSize)}`} type={document.status} meta={formatPlatformDateTime(document.updatedAt)} status={document} onOpen={() => onOpenDocument(document)} />)}
  </div>;
}

function BrowserRowsHeader({ name, description, columns = false }: { name: string; description: string; columns?: boolean }) {
  return <div className="grid min-h-14 grid-cols-[minmax(0,1fr)_8rem_12rem_2rem] items-center gap-3 border-b bg-muted/10 px-5 text-xs text-muted-foreground"><div><strong className="block text-sm text-foreground">{name}</strong><span>{description}</span></div>{columns ? <><span>Type / status</span><span>Modified</span><span /></> : null}</div>;
}

function BrowserRow({ icon, name, detail, type, meta, status, onOpen }: { icon: ReactNode; name: string; detail: string; type: string; meta: string; status?: VectorDocument; onOpen: () => void }) {
  return <button type="button" className="grid min-h-16 w-full grid-cols-[minmax(0,1fr)_8rem_12rem_2rem] items-center gap-3 border-b px-5 text-left hover:bg-muted/25 focus-visible:outline-2 focus-visible:outline-offset-[-2px]" onClick={onOpen}>
    <span className="flex min-w-0 items-center gap-3"><span className="grid size-9 shrink-0 place-items-center border bg-muted/15 [&_svg]:size-4">{icon}</span><span className="min-w-0"><strong className="block truncate text-sm">{name}</strong><span className="block truncate text-xs text-muted-foreground">{detail}</span></span></span>
    <span className="text-xs">{status ? <StatusDot label={status.status} tone={documentTone(status.status)} /> : type}</span><span className="truncate text-xs text-muted-foreground">{meta}</span><ChevronRight className="size-4 text-muted-foreground" />
  </button>;
}

function FileInspector({ database, document, pending, error, contentLocked, canDelete, onDelete }: { database: VectorDatabaseDefinition; document: VectorDocument; pending: boolean; error: Error | null; contentLocked: boolean; canDelete: boolean; onDelete: () => void }) {
  return <InspectorShell eyebrow="Source file" title={document.filename} icon={<FileText />} description={`Revision ${document.activeRevision} · uploaded ${formatPlatformDateTime(document.createdAt)}`} actions={<Button variant="outline" className="h-11 text-destructive" disabled={!canDelete} onClick={onDelete}><Trash2 />Delete file</Button>}>
    <DefinitionGrid><Definition label="Status" value={document.status} /><Definition label="Size" value={formatBytes(document.byteSize)} /><Definition label="Pages" value={String(document.pageCount || "—")} /><Definition label="Vectors" value={`${document.chunkCount} chunks`} /><Definition label="Parser" value="Docling" /><Definition label="OCR" value={document.ocrPageCount ? `${document.ocrPageCount} pages` : "Not used"} /><Definition label="Embedding model" value={database.embeddingModel ?? "Provider managed"} mono /><Definition label="Dimensions" value={database.embeddingDimensions ? `${database.embeddingDimensions}d` : "Provider managed"} mono /></DefinitionGrid>
    {document.error ? <ErrorNotice>{document.error}</ErrorNotice> : null}
    {contentLocked ? <LockedContent /> : pending ? <div className="space-y-3"><Skeleton className="h-4 w-40" /><Skeleton className="h-20 w-full" /></div> : error ? <ErrorNotice>{error.message}</ErrorNotice> : <p className="text-sm text-muted-foreground">Expand the {document.pageCount ? "Pages" : "Indexed content"} branch in Explorer, then select an item to inspect its exact chunks.</p>}
  </InspectorShell>;
}

function StructureInspector({ document, groups, pending, error, contentLocked }: { document: VectorDocument; groups: DocumentGroup[]; pending: boolean; error: Error | null; contentLocked: boolean }) {
  const label = document.pageCount ? "Pages" : "Indexed content";
  return <InspectorShell eyebrow="Indexed structure" title={label} icon={<Layers3 />} description={document.filename}>
    {contentLocked ? <LockedContent /> : pending ? <div className="space-y-3"><Skeleton className="h-4 w-40" /><Skeleton className="h-20 w-full" /></div> : error ? <ErrorNotice>{error.message}</ErrorNotice> : <div className="border bg-muted/10 p-5"><strong className="text-sm">{groups.length} indexed {document.pageCount ? "pages" : "sections"}</strong><p className="mt-2 text-sm leading-6 text-muted-foreground">Expand this branch in Explorer and select a {document.pageCount ? "page" : "section"} to inspect its chunks. Chunks stay in the detail pane so the file tree remains compact.</p></div>}
  </InspectorShell>;
}

function GroupInspector({ document, group, onSelectChunk }: { document: VectorDocument; group: DocumentGroup; onSelectChunk: (chunk: VectorDocumentChunk) => void }) {
  return <InspectorShell eyebrow={group.kind === "page" ? "Page" : group.kind === "section" ? "Section" : "Document content"} title={group.label} icon={<Layers3 />} description={`${document.filename}${group.context ? ` · ${group.context}` : ""}`}>
    <div className="space-y-3">{group.chunks.map((chunk) => <button key={chunk.id} type="button" className="block min-h-11 w-full border p-4 text-left hover:bg-muted/25 focus-visible:outline-2 focus-visible:outline-offset-[-2px]" onClick={() => onSelectChunk(chunk)}><span className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">Chunk {chunk.chunkIndex + 1}</strong><span className="font-mono text-xs text-muted-foreground">{chunk.tokenCount} tokens</span></span><span className="mt-3 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{chunk.content}</span></button>)}</div>
  </InspectorShell>;
}

function ChunkInspector({ document, group, chunk }: { document: VectorDocument; group: DocumentGroup; chunk: VectorDocumentChunk }) {
  return <InspectorShell eyebrow="Indexed chunk" title={`Chunk ${chunk.chunkIndex + 1}`} icon={<Braces />} description={`${document.filename} · ${group.label}`}>
    <DefinitionGrid><Definition label="Tokens" value={String(chunk.tokenCount)} mono /><Definition label="Page" value={chunk.pageNumber ? String(chunk.pageNumber) : "—"} /><Definition label="Section" value={chunk.sectionPath.join(" › ") || chunk.label || "Document"} /><Definition label="Chunk ID" value={chunk.id} mono /></DefinitionGrid>
    <section><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Exact indexed text</h3><p className="mt-3 whitespace-pre-wrap border bg-muted/15 p-4 text-sm leading-7">{chunk.content}</p></section>
  </InspectorShell>;
}

function InspectorShell({ eyebrow, title, icon, description, actions, children }: { eyebrow: string; title: string; icon: ReactNode; description: string; actions?: ReactNode; children: ReactNode }) {
  return <main className="min-w-0 bg-background">
    <header className="border-b px-5 py-5 sm:px-6"><div className="flex flex-wrap items-start justify-between gap-4"><div className="flex min-w-0 items-start gap-3"><span className="grid size-10 shrink-0 place-items-center border bg-muted/20 [&_svg]:size-5">{icon}</span><div className="min-w-0"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{eyebrow}</p><h2 className="mt-1 break-words text-lg font-semibold">{title}</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p></div></div>{actions}</div></header>
    <div className="space-y-6 p-5 sm:p-6">{children}</div>
  </main>;
}

function InspectorEmpty({ title, children }: { title: string; children: ReactNode }) {
  return <div className="grid min-h-[24rem] place-items-center p-8 text-center"><div><FileText className="mx-auto size-6 text-muted-foreground" /><strong className="mt-3 block">{title}</strong><p className="mt-2 max-w-sm text-sm text-muted-foreground">{children}</p></div></div>;
}

function LockedContent() {
  return <div className="border bg-muted/15 p-4"><div className="flex items-start gap-3"><LockKeyhole className="mt-0.5 size-5 shrink-0 text-muted-foreground" /><div><strong className="text-sm">Indexed content is restricted</strong><p className="mt-1 text-xs leading-5 text-muted-foreground">CAP_VECTOR_DATABASE_CONTENT_VIEW is required to inspect pages, chunks, or run recall. File inventory and indexing metadata remain visible.</p></div></div></div>;
}

function DefinitionGrid({ children }: { children: ReactNode }) { return <dl className="grid gap-px overflow-hidden border bg-border sm:grid-cols-2 xl:grid-cols-4">{children}</dl>; }
function Definition({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) { return <div className="min-w-0 bg-background p-4"><dt className="text-xs text-muted-foreground">{label}</dt><dd className={cn("mt-2 break-words text-sm font-medium", mono && "font-mono text-xs")}>{value}</dd></div>; }

function UploadDocumentSheet({ open, allowed, files, destinationPath, inputKey, pending, error, onOpenChange, onFiles, onUpload }: { open: boolean; allowed: boolean; files: UploadCandidate[]; destinationPath: string; inputKey: number; pending: boolean; error: Error | null; onOpenChange: (open: boolean) => void; onFiles: (files: UploadCandidate[]) => void; onUpload: () => void }) {
  const accept = ".pdf,.docx,.pptx,.xlsx,.html,.htm,.md,.txt,.png,.jpg,.jpeg,.tif,.tiff";
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent side="right" className="w-[min(94vw,38rem)] sm:max-w-[38rem]"><SheetHeader className="border-b px-5 py-5"><SheetTitle>Upload to directory</SheetTitle><SheetDescription>Destination: <span className="font-mono text-foreground">{displayDirectory(destinationPath)}</span>. Folder hierarchy is preserved before Docling parsing and vector indexing.</SheetDescription></SheetHeader><div className="flex-1 space-y-5 overflow-auto px-5 py-4">
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="flex min-h-32 cursor-pointer flex-col justify-between border border-dashed p-4 hover:bg-muted/20"><FileUp className="size-6 text-primary" /><span><strong className="block text-sm">Upload files</strong><span className="mt-1 block text-xs text-muted-foreground">Select one or more source files.</span></span><input key={`files-${inputKey}`} className="sr-only" disabled={pending || !allowed} type="file" multiple accept={accept} onChange={(event) => onFiles([...event.target.files ?? []].map((file) => ({ file, relativePath: file.name })))} /></label>
      <label className="flex min-h-32 cursor-pointer flex-col justify-between border border-dashed p-4 hover:bg-muted/20"><FolderOpen className="size-6 text-primary" /><span><strong className="block text-sm">Upload folder</strong><span className="mt-1 block text-xs text-muted-foreground">Preserve its nested directory paths.</span></span><input key={`folder-${inputKey}`} className="sr-only" disabled={pending || !allowed} type="file" multiple accept={accept} {...{ webkitdirectory: "", directory: "" }} onChange={(event) => onFiles([...event.target.files ?? []].map((file) => ({ file, relativePath: file.webkitRelativePath || file.name })))} /></label>
    </div>
    <p className="text-xs leading-5 text-muted-foreground">PDF, Office, HTML, Markdown, text, or images · maximum 25 MiB per file.</p>
    {files.length ? <div className="border"><div className="flex items-center justify-between border-b bg-muted/10 px-4 py-3"><strong className="text-sm">Upload queue</strong><span className="text-xs text-muted-foreground">{files.length} files · {formatBytes(files.reduce((total, item) => total + item.file.size, 0))}</span></div><div className="max-h-72 overflow-auto">{files.map((item, index) => <div key={`${item.relativePath}-${index}`} className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0"><FileText className="size-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{item.relativePath}</strong><span className="text-xs text-muted-foreground">{formatBytes(item.file.size)}</span></span></div>)}</div></div> : null}
    {!allowed ? <LockedContent /> : null}{error ? <ErrorNotice>{error.message}</ErrorNotice> : null}
  </div><SheetFooter className="border-t px-5 py-4 sm:flex-row sm:justify-end"><Button variant="outline" className="h-11" disabled={pending} onClick={() => onOpenChange(false)}>Cancel</Button><Button className="h-11" disabled={!files.length || pending || !allowed} onClick={onUpload}><FileUp />{pending ? `Queueing ${files.length}…` : `Upload & index ${files.length || ""}`}</Button></SheetFooter></SheetContent></Sheet>;
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

function buildExplorerTree(
  documents: readonly VectorDocument[],
  details: Readonly<Record<string, VectorDocumentDetail>>,
  loadingDocumentIds: ReadonlySet<string>,
  documentErrors: Readonly<Record<string, string>>,
  contentLocked: boolean,
): ExplorerTreeNode[] {
  const directoryChildren = (path: string): ExplorerTreeNode[] => {
    const folders: ExplorerTreeNode[] = directChildDirectories(documents, path).map((folder) => ({
      id: `directory:${folder.path}`,
      kind: "directory",
      name: folder.name,
      path: folder.path,
      meta: String(folder.documentCount),
      children: directoryChildren(folder.path),
    }));
    const files: ExplorerTreeNode[] = documents
      .filter((document) => document.directoryPath === path)
      .toSorted((left, right) => left.filename.localeCompare(right.filename))
      .map((document) => {
        const detail = details[document.id];
        const documentError = documentErrors[document.id];
        const groups = detail ? buildDocumentGroups(detail.chunks) : [];
        const hasStructure = document.pageCount > 0 || document.chunkCount > 0;
        let structureChildren: ExplorerTreeNode[] = [];
        if (contentLocked) {
          structureChildren = [{ id: `hint:locked:${document.id}`, kind: "hint", name: "Content access required", tone: "locked" }];
        } else if (loadingDocumentIds.has(document.id)) {
          structureChildren = [{ id: `hint:loading:${document.id}`, kind: "hint", name: "Loading indexed pages…" }];
        } else if (documentError) {
          structureChildren = [{ id: `hint:error:${document.id}`, kind: "hint", name: documentError, tone: "danger" }];
        } else if (detail) {
          structureChildren = groups.length
            ? groups.map((group) => ({
              id: explorerGroupNodeId(document.id, group.key),
              kind: "group" as const,
              name: group.label,
              documentId: document.id,
              group,
              meta: String(group.chunks.length),
            }))
            : [{ id: `hint:empty:${document.id}`, kind: "hint", name: "No indexed content" }];
        } else {
          structureChildren = [{ id: `hint:load:${document.id}`, kind: "hint", name: "Expand to load indexed pages" }];
        }
        return {
          id: `document:${document.id}`,
          kind: "document" as const,
          name: document.filename,
          document,
          ...(hasStructure ? {
            children: [{
              id: `structure:${document.id}`,
              kind: "structure" as const,
              name: document.pageCount ? "Pages" : "Indexed content",
              documentId: document.id,
              meta: String(document.pageCount || groups.length),
              children: structureChildren,
            }],
          } : {}),
        };
      });
    return [...folders, ...files];
  };

  return [{
    id: "directory:/",
    kind: "directory",
    name: "Documents",
    path: "/",
    meta: String(documents.length),
    children: directoryChildren("/"),
  }];
}

function explorerSelectionNodeId(selection: ExplorerSelection) {
  if (selection.kind === "directory") return `directory:${selection.path}`;
  if (selection.kind === "document") return `document:${selection.documentId}`;
  if (selection.kind === "structure") return `structure:${selection.documentId}`;
  return explorerGroupNodeId(selection.documentId, selection.groupKey);
}

function explorerGroupNodeId(documentId: string, groupKey: string) {
  return `group:${documentId}:${groupKey}`;
}

function useElementHeight(fallback: number) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = useState(fallback);
  useEffect(() => {
    const element = elementRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const update = (nextHeight: number) => {
      if (nextHeight > 0) setHeight(Math.round(nextHeight));
    };
    update(element.getBoundingClientRect().height);
    const observer = new ResizeObserver(([entry]) => update(entry?.contentRect.height ?? 0));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [elementRef, height] as const;
}

function buildDocumentGroups(chunks: readonly VectorDocumentChunk[]): DocumentGroup[] {
  const hasPages = chunks.some((chunk) => chunk.pageNumber !== null);
  const grouped = new Map<string, VectorDocumentChunk[]>();
  for (const chunk of chunks) {
    const key = hasPages ? chunk.pageNumber === null ? "page:unpaged" : `page:${chunk.pageNumber}` : chunk.sectionPath.length ? `section:${chunk.sectionPath.join(" › ")}` : "document";
    grouped.set(key, [...(grouped.get(key) ?? []), chunk]);
  }
  return [...grouped.entries()].map(([key, items]) => {
    const pageNumber = items.find((chunk) => chunk.pageNumber !== null)?.pageNumber ?? null;
    const sectionLabels = [...new Set(items.map((chunk) => chunk.sectionPath.at(-1) || chunk.label || "").filter(Boolean))];
    const context = sectionLabels.length > 1 ? `${sectionLabels[0]} +${sectionLabels.length - 1}` : sectionLabels[0] ?? "";
    return { key, label: hasPages ? pageNumber ? `Page ${pageNumber}` : "Unpaged content" : key === "document" ? "Document" : key.slice("section:".length), context, kind: hasPages ? "page" as const : key === "document" ? "document" as const : "section" as const, chunks: items.toSorted((left, right) => left.chunkIndex - right.chunkIndex) };
  }).toSorted((left, right) => {
    const leftPage = left.chunks[0]?.pageNumber ?? Number.MAX_SAFE_INTEGER;
    const rightPage = right.chunks[0]?.pageNumber ?? Number.MAX_SAFE_INTEGER;
    return hasPages ? leftPage - rightPage : left.label.localeCompare(right.label);
  });
}

function overviewDocumentDirectory(selection: ExplorerSelection, documents: readonly VectorDocument[]) {
  if (selection.kind === "directory") return selection.path;
  if (!("documentId" in selection)) return "/";
  return documents.find((document) => document.id === selection.documentId)?.directoryPath ?? "/";
}

function pathSegments(path: string) {
  return path.split("/").filter(Boolean);
}

function displayDirectory(path: string) {
  return path === "/" ? "/Documents" : `/Documents${path}`;
}

function normalizeDirectoryPath(path: string) {
  const segments = path.replace(/\\/g, "/").split("/").map((segment) => segment.trim()).filter(Boolean);
  return segments.length ? `/${segments.join("/")}` : "/";
}

function joinDirectoryPath(base: string, relative: string) {
  return normalizeDirectoryPath(`${base}/${relative}`);
}

function parentPath(relativePath: string) {
  const segments = relativePath.replace(/\\/g, "/").split("/").filter(Boolean);
  return segments.slice(0, -1).join("/");
}

function directChildDirectories(documents: readonly VectorDocument[], path: string) {
  const prefix = path === "/" ? "/" : `${path}/`;
  const folders = new Map<string, number>();
  for (const document of documents) {
    if (!document.directoryPath.startsWith(prefix) || document.directoryPath === path) continue;
    const child = document.directoryPath.slice(prefix.length).split("/")[0];
    if (!child) continue;
    folders.set(child, (folders.get(child) ?? 0) + 1);
  }
  return [...folders.entries()]
    .map(([name, documentCount]) => ({ name, documentCount, path: joinDirectoryPath(path, name) }))
    .toSorted((left, right) => left.name.localeCompare(right.name));
}

async function collectDroppedFiles(dataTransfer: DataTransfer): Promise<UploadCandidate[]> {
  const items = [...dataTransfer.items];
  const entries: FileSystemEntry[] = [];
  for (const item of items) {
    const entry = item.webkitGetAsEntry?.();
    if (entry) entries.push(entry);
  }
  if (!entries.length) return [...dataTransfer.files].map((file) => ({ file, relativePath: file.name }));
  const files: UploadCandidate[] = [];
  for (const entry of entries) await walkDroppedEntry(entry, "", files);
  return files;
}

async function walkDroppedEntry(entry: FileSystemEntry, parent: string, output: UploadCandidate[]): Promise<void> {
  const relativePath = [parent, entry.name].filter(Boolean).join("/");
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
    output.push({ file, relativePath });
    return;
  }
  if (!entry.isDirectory) return;
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  while (true) {
    const children = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (!children.length) break;
    for (const child of children) await walkDroppedEntry(child, relativePath, output);
  }
}
function isAccessDenied(error: unknown) { return /access denied|CAP_VECTOR_DATABASE_CONTENT_VIEW|\b403\b/i.test(errorMessage(error)); }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : typeof error === "string" ? error : "An unexpected error occurred."; }
function Fact({ label, value }: { label: string; value: string }) { return <span className="text-xs"><span className="block text-muted-foreground">{label}</span><strong className="mt-1 block">{value}</strong></span>; }
function SchemaFact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) { return <div className="bg-background p-5"><p className="text-xs text-muted-foreground">{label}</p><p className={cn("mt-2 break-words text-sm font-medium", mono && "font-mono")}>{value}</p></div>; }
function SchemaFactPlain({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 break-all text-sm">{value}</p></div>; }
function Notice({ children }: { children: ReactNode }) { return <p role="status" className="border-l-2 border-primary bg-primary/5 px-4 py-3 text-sm">{children}</p>; }
function ErrorNotice({ children }: { children: ReactNode }) { return <p role="alert" className="border-l-2 border-destructive bg-destructive/5 px-4 py-3 text-sm text-destructive">{children}</p>; }
function EmptyDocuments({ builtIn }: { builtIn: boolean }) { return <div className="px-6 py-14 text-center"><FileText className="mx-auto size-6 text-muted-foreground" /><strong className="mt-3 block">No files</strong><p className="mt-1 text-xs text-muted-foreground">{builtIn ? "Upload a source file to start Docling parsing and vector indexing." : "Manage files in the external provider console."}</p></div>; }
function DetailSkeleton() { return <div className="space-y-5"><Skeleton className="h-11 w-48" /><Skeleton className="h-28 w-full" /><Skeleton className="h-12 w-96 max-w-full" /><Skeleton className="h-[38rem] w-full" /></div>; }
function formatBytes(value: number) { return value < 1024 * 1024 ? `${Math.max(1, Math.round(value / 1024))} KiB` : `${(value / 1024 / 1024).toFixed(1)} MiB`; }
function documentTone(status: VectorDocument["status"]): "success" | "danger" | "warning" | "neutral" { return status === "READY" ? "success" : status === "FAILED" ? "danger" : status === "QUEUED" ? "neutral" : "warning"; }
function editableDatabase(database: VectorDatabaseDefinition) { const { id: _id, status: _status, lastReconciliationError: _error, ...input } = database; return input; }
