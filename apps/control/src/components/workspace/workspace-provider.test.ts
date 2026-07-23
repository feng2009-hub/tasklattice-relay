import { describe, expect, it } from "vitest";
import { selectInitialWorkspace } from "./workspace-context";
import type { Workspace } from "@/types/workspace";

const workspaces: Workspace[] = [
  {
    id: "individual",
    name: "Individual",
    type: "personal",
    memberCount: 1,
    role: "owner",
  },
  {
    id: "devops",
    name: "DevOps Team",
    type: "team",
    memberCount: 8,
    role: "member",
  },
];

describe("selectInitialWorkspace", () => {
  it("prefers the URL workspace over stored state", () => {
    expect(selectInitialWorkspace(workspaces, "devops", "individual").id).toBe(
      "devops",
    );
  });

  it("uses stored state when the URL workspace is unavailable", () => {
    expect(selectInitialWorkspace(workspaces, "missing", "devops").id).toBe(
      "devops",
    );
  });

  it("falls back to the first available workspace", () => {
    expect(selectInitialWorkspace(workspaces, null, null).id).toBe(
      "individual",
    );
  });

  it("guarantees a personal fallback when no workspaces are returned", () => {
    expect(selectInitialWorkspace([], null, null)).toMatchObject({
      id: "individual",
      name: "Individual",
      role: "owner",
      type: "personal",
    });
  });
});
