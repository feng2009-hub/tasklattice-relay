import type { VectorDocument, VectorFolder } from "@tali/contracts";

export type FileBrowserSelection =
  | { kind: "folder"; id: string }
  | { kind: "file"; id: string };

export function childFolders(
  folders: readonly VectorFolder[],
  parentId: string | null,
): VectorFolder[] {
  return folders
    .filter((folder) => folder.parentId === parentId)
    .toSorted((left, right) => left.name.localeCompare(right.name));
}

export function childDocuments(
  documents: readonly VectorDocument[],
  folderId: string | null,
): VectorDocument[] {
  return documents
    .filter((document) => document.folderId === folderId)
    .toSorted((left, right) => left.filename.localeCompare(right.filename));
}

export function folderBreadcrumbs(
  folders: readonly VectorFolder[],
  folderId: string | null,
): VectorFolder[] {
  if (!folderId) return [];
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const result: VectorFolder[] = [];
  const visited = new Set<string>();
  let current = byId.get(folderId);
  while (current) {
    if (visited.has(current.id)) break;
    visited.add(current.id);
    result.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return result;
}

export function descendantFolderIds(
  folders: readonly VectorFolder[],
  folderId: string,
): Set<string> {
  const result = new Set<string>();
  const pending = [folderId];
  while (pending.length) {
    const parentId = pending.pop()!;
    for (const folder of folders) {
      if (folder.parentId !== parentId || result.has(folder.id)) continue;
      result.add(folder.id);
      pending.push(folder.id);
    }
  }
  return result;
}

export function filePath(document: VectorDocument): string {
  return document.directoryPath === "/"
    ? `/${document.filename}`
    : `${document.directoryPath}/${document.filename}`;
}

export function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KiB`;
  return `${(value / 1024 / 1024).toFixed(1)} MiB`;
}
