import { describe, expect, it } from "vitest";
import { projectIdFromPathname } from "./project-storage";

describe("projectIdFromPathname", () => {
  it("keeps global administration routes outside Project URL rewriting", () => {
    expect(projectIdFromPathname("/platform/settings")).toBeNull();
    expect(projectIdFromPathname("/departments/dep1/settings")).toBeNull();
  });

  it("continues to resolve Project-scoped routes", () => {
    expect(projectIdFromPathname("/proj1/instances")).toBe("proj1");
    expect(projectIdFromPathname("/team%20agents/cost")).toBe("team agents");
  });
});
