import { describe, expect, it } from "vitest";
import type { VectorFolder } from "@tali/contracts";
import { descendantFolderIds, folderBreadcrumbs } from "./file-browser-utils";

const base = {
  databaseId: "db-1",
  directChildCount: 0,
  totalFileCount: 0,
  totalVectorCount: 0,
  processingFileCount: 0,
  failedFileCount: 0,
  createdAt: "2026-08-27T00:00:00.000Z",
  updatedAt: "2026-08-27T00:00:00.000Z",
};

const folders: VectorFolder[] = [
  { ...base, id: "00000000-0000-4000-8000-000000000001", parentId: null, name: "Research", path: "/Research" },
  { ...base, id: "00000000-0000-4000-8000-000000000002", parentId: "00000000-0000-4000-8000-000000000001", name: "Agents", path: "/Research/Agents" },
  { ...base, id: "00000000-0000-4000-8000-000000000003", parentId: "00000000-0000-4000-8000-000000000002", name: "Evaluation", path: "/Research/Agents/Evaluation" },
];

describe("Vector Database file browser hierarchy", () => {
  it("builds root-to-current breadcrumbs", () => {
    expect(folderBreadcrumbs(folders, folders[2]!.id).map((folder) => folder.name))
      .toEqual(["Research", "Agents", "Evaluation"]);
  });

  it("finds every nested folder for move and recursive delete guards", () => {
    expect([...descendantFolderIds(folders, folders[0]!.id)])
      .toEqual([folders[1]!.id, folders[2]!.id]);
  });
});
