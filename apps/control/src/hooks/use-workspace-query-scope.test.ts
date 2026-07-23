import { describe, expect, it } from "vitest";
import { workspaceQueryKey } from "./use-workspace-query-scope";

describe("workspaceQueryKey", () => {
  it("isolates the same resource key by workspace", () => {
    expect(workspaceQueryKey("individual", "cost", "summary")).not.toEqual(
      workspaceQueryKey("devops", "cost", "summary"),
    );
  });

  it("keeps the workspace prefix available for targeted invalidation", () => {
    expect(workspaceQueryKey("devops", "instances")).toEqual([
      "workspace",
      "devops",
      "instances",
    ]);
  });
});
