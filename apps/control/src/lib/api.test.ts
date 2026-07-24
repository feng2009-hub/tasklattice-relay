import { describe, expect, it } from "vitest";
import { projectScopedPath } from "./api";

describe("projectScopedPath", () => {
  it("adds the active project to every resource request", () => {
    expect(projectScopedPath("/api/v1/agents", "ai trading")).toBe(
      "/api/v1/agents?project_id=ai+trading",
    );
  });

  it("preserves existing query parameters and replaces stale project context", () => {
    expect(
      projectScopedPath(
        "/api/v1/costs/summary?timezone=Asia%2FShanghai&project_id=old",
        "web3",
      ),
    ).toBe(
      "/api/v1/costs/summary?timezone=Asia%2FShanghai&project_id=web3",
    );
  });

  it("leaves pre-authentication requests unchanged without a project", () => {
    expect(projectScopedPath("/api/v1/auth/local", null)).toBe(
      "/api/v1/auth/local",
    );
  });
});
