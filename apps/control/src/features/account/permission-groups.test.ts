import { describe, expect, it } from "vitest";
import { projectCapabilities } from "@tali/contracts";

import { groupProjectCapabilities } from "./permission-groups";

describe("groupProjectCapabilities", () => {
  it("assigns every known capability to exactly one named domain", () => {
    const groups = groupProjectCapabilities(projectCapabilities);
    const assigned = groups.flatMap((group) => group.items);

    expect(groups.map((group) => group.id)).not.toContain("other");
    expect(new Set(assigned).size).toBe(projectCapabilities.length);
    expect(assigned).toHaveLength(projectCapabilities.length);
  });
});
