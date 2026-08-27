import { useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import type { VectorDocument, VectorFolder } from "@tali/contracts";
import {
  ChevronRight,
  FileText,
  FileUp,
  FlaskConical,
  Folder,
  FolderPlus,
  MoreHorizontal,
  Move,
  Pencil,
  RefreshCw,
  Tags,
  Trash2,
} from "lucide-react";
import { StatusDot } from "@/components/shared/status-dot";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatPlatformDateTime } from "@/lib/platform-preferences";
import { cn } from "@/lib/utils";
import {
  childDocuments,
  childFolders,
  folderBreadcrumbs,
  formatBytes,
  type FileBrowserSelection,
} from "./file-browser-utils";

type ObjectAction = "rename" | "move" | "edit-metadata" | "delete";

export function VectorDatabaseFileBrowser({
  builtIn,
  canManage,
  canTestRetrieval,
  currentFolderId,
  documents,
  folders,
  refreshing,
  selection,
  onAction,
  onCurrentFolderChange,
  onNewFolder,
  onRefresh,
  onSelectionChange,
  onTestRetrieval,
  onUpload,
}: {
  builtIn: boolean;
  canManage: boolean;
  canTestRetrieval: boolean;
  currentFolderId: string | null;
  documents: VectorDocument[];
  folders: VectorFolder[];
  refreshing: boolean;
  selection: FileBrowserSelection | null;
  onAction: (action: ObjectAction, selection: FileBrowserSelection) => void;
  onCurrentFolderChange: (folderId: string | null) => void;
  onNewFolder: () => void;
  onRefresh: () => void;
  onSelectionChange: (selection: FileBrowserSelection | null) => void;
  onTestRetrieval: () => void;
  onUpload: () => void;
}) {
  const [sort, setSort] = useState<"name" | "updated">("name");
  const breadcrumbs = folderBreadcrumbs(folders, currentFolderId);
  const rows = useMemo(() => {
    const folderRows = childFolders(folders, currentFolderId).map((folder) => ({
      kind: "folder" as const,
      folder,
      name: folder.name,
      updatedAt: folder.updatedAt,
    }));
    const fileRows = childDocuments(documents, currentFolderId).map((document) => ({
      kind: "file" as const,
      document,
      name: document.filename,
      updatedAt: document.updatedAt,
    }));
    const sorter = sort === "updated"
      ? (left: (typeof folderRows)[number] | (typeof fileRows)[number], right: (typeof folderRows)[number] | (typeof fileRows)[number]) =>
        right.updatedAt.localeCompare(left.updatedAt)
      : (left: (typeof folderRows)[number] | (typeof fileRows)[number], right: (typeof folderRows)[number] | (typeof fileRows)[number]) =>
        left.name.localeCompare(right.name);
    return [...folderRows.toSorted(sorter), ...fileRows.toSorted(sorter)];
  }, [currentFolderId, documents, folders, sort]);

  const open = (next: FileBrowserSelection) => {
    if (next.kind === "folder") onCurrentFolderChange(next.id);
    else onSelectionChange(next);
  };
  const activate = (event: KeyboardEvent<HTMLDivElement>, next: FileBrowserSelection) => {
    if (event.key === "Enter") {
      event.preventDefault();
      open(next);
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onSelectionChange(null);
      event.currentTarget.blur();
    }
  };

  return (
    <section className="flex min-h-[36rem] min-w-0 flex-col bg-background" aria-label="Vector Database files">
      <header className="flex flex-col gap-3 border-b px-4 py-3 sm:px-5 xl:flex-row xl:items-center xl:justify-between">
        <nav aria-label="Current folder" className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
          <button
            type="button"
            className="min-h-11 rounded-sm px-2 font-medium hover:bg-muted focus-visible:outline-2"
            onClick={() => onCurrentFolderChange(null)}
          >
            Files
          </button>
          {breadcrumbs.map((folder) => (
            <span className="contents" key={folder.id}>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              <button
                type="button"
                className="min-h-11 max-w-48 truncate rounded-sm px-2 font-medium hover:bg-muted focus-visible:outline-2"
                onClick={() => onCurrentFolderChange(folder.id)}
              >
                {folder.name}
              </button>
            </span>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={sort} onValueChange={(value) => setSort(value as "name" | "updated")}>
            <SelectTrigger aria-label="Sort files" className="h-11 w-32"><SelectValue /></SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="updated">Updated</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" className="size-11" aria-label="Refresh files" onClick={onRefresh}>
            <RefreshCw className={cn(refreshing && "animate-spin motion-reduce:animate-none")} />
          </Button>
          {builtIn ? <Button variant="outline" className="h-11" disabled={!canManage} onClick={onNewFolder}><FolderPlus /> New folder</Button> : null}
          <Button variant="outline" className="h-11" disabled={!canTestRetrieval} onClick={onTestRetrieval}><FlaskConical /> Test retrieval</Button>
          {builtIn ? <Button className="h-11" disabled={!canManage} onClick={onUpload}><FileUp /> Upload files</Button> : null}
        </div>
      </header>

      <div className="grid min-h-11 grid-cols-[minmax(0,1fr)_7rem_3rem] items-center gap-3 border-b bg-muted/15 px-4 text-xs font-medium text-muted-foreground sm:px-5 md:grid-cols-[minmax(0,1fr)_8rem_6rem_9rem_3rem]">
        <span>Name</span>
        <span>Status</span>
        <span className="hidden md:block">Chunks</span>
        <span className="hidden md:block">Updated</span>
        <span />
      </div>

      <div
        className="min-h-0 flex-1"
        onClick={(event) => {
          if (event.currentTarget === event.target) onSelectionChange(null);
        }}
      >
        {rows.map((row) => {
          const next: FileBrowserSelection = row.kind === "folder"
            ? { kind: "folder", id: row.folder.id }
            : { kind: "file", id: row.document.id };
          const selected = selection?.kind === next.kind && selection.id === next.id;
          return (
            <div
              key={`${row.kind}:${next.id}`}
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              className={cn(
                "group grid min-h-16 cursor-pointer grid-cols-[minmax(0,1fr)_7rem_3rem] items-center gap-3 border-b px-4 text-left outline-none hover:bg-muted/25 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5 md:grid-cols-[minmax(0,1fr)_8rem_6rem_9rem_3rem]",
                selected && "bg-primary/8 hover:bg-primary/8",
              )}
              onClick={() => open(next)}
              onKeyDown={(event) => activate(event, next)}
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-sm text-muted-foreground",
                  row.kind === "folder" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-muted",
                )}>
                  {row.kind === "folder" ? <Folder className="size-4" /> : <FileText className="size-4" />}
                </span>
                <span className="min-w-0">
                  <strong className={cn("block truncate text-sm", selected && "text-primary")}>{row.name}</strong>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">
                    {row.kind === "folder"
                      ? `${row.folder.totalFileCount} files · ${row.folder.totalVectorCount} vectors`
                      : `${formatBytes(row.document.byteSize)} · ${row.document.mediaType}`}
                  </span>
                </span>
              </span>
              <span className="text-xs">
                {row.kind === "folder"
                  ? <span className="text-muted-foreground">—</span>
                  : <StatusDot label={statusLabel(row.document.status)} tone={statusTone(row.document.status)} />}
              </span>
              <span className="hidden font-mono text-xs md:block">
                {row.kind === "folder" ? row.folder.totalVectorCount : row.document.chunkCount}
              </span>
              <span className="hidden truncate text-xs text-muted-foreground md:block">
                {formatPlatformDateTime(row.updatedAt)}
              </span>
              <ObjectMenu
                canManage={canManage}
                kind={row.kind}
                label={`Actions for ${row.name}`}
                onAction={(action) => onAction(action, next)}
              />
            </div>
          );
        })}
        {!rows.length ? (
          <div className="grid min-h-72 place-items-center px-6 py-12 text-center">
            <div>
              <Folder className="mx-auto size-7 text-muted-foreground" />
              <strong className="mt-4 block text-sm">This folder is empty</strong>
              <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-muted-foreground">
                {builtIn
                  ? "Upload source files here or create a folder to organize them."
                  : "Files for this provider are managed outside TaskLattice."}
              </p>
              {builtIn && canManage ? <Button className="mt-5 h-11" onClick={(event) => { event.stopPropagation(); onUpload(); }}><FileUp />Upload files</Button> : null}
            </div>
          </div>
        ) : null}
      </div>
      <footer className="border-t px-4 py-3 text-xs text-muted-foreground sm:px-5">
        {rows.length} items · select a folder to open it or a file to view details
      </footer>
    </section>
  );
}

function ObjectMenu({ canManage, kind, label, onAction }: {
  canManage: boolean;
  kind: "file" | "folder";
  label: string;
  onAction: (action: ObjectAction) => void;
}) {
  if (!canManage) return <span />;
  const stop = (event: MouseEvent) => event.stopPropagation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-11" aria-label={label} onClick={stop}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={stop}>
        <DropdownMenuItem onSelect={() => onAction("rename")}><Pencil />Rename</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onAction("move")}><Move />Move</DropdownMenuItem>
        {kind === "file" ? <DropdownMenuItem onSelect={() => onAction("edit-metadata")}><Tags />Edit metadata</DropdownMenuItem> : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => onAction("delete")}><Trash2 />Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function statusLabel(status: VectorDocument["status"]): string {
  if (status === "READY") return "Indexed";
  if (status === "FAILED") return "Failed";
  if (status === "QUEUED") return "Uploading";
  return "Processing";
}

function statusTone(status: VectorDocument["status"]): "success" | "danger" | "warning" | "neutral" {
  if (status === "READY") return "success";
  if (status === "FAILED") return "danger";
  if (status === "QUEUED") return "neutral";
  return "warning";
}
