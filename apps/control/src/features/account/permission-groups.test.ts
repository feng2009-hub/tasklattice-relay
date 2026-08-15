import { describe, expect, it } from "vitest";
import { projectCapabilities } from "@tali/contracts";

import { groupProjectCapabilities } from "./permission-groups";

describe("groupProjectCapabilities", () => {
  it("assigns every known capability to exactly one named domain", () => {
    const groups = groupProjectCapabilities(projectCapabilities);
    const assigned = groups.flatMap((group) =>
      group.items.map((item) => item.capability),
    );

    expect(groups.map((group) => group.id)).not.toContain("other");
    expect(new Set(assigned).size).toBe(projectCapabilities.length);
    expect(assigned).toHaveLength(projectCapabilities.length);
    expect(groups.flatMap((group) => group.items).every((item) => item.enabled))
      .toBe(true);
  });

  it("includes disabled capabilities when only part of the catalog is granted", () => {
    const granted = ["CAP_PROJECT_VIEW", "CAP_AGENT_INSTANCE_VIEW"] as const;
    const items = groupProjectCapabilities(granted).flatMap(
      (group) => group.items,
    );

    expect(items).toHaveLength(projectCapabilities.length);
    expect(items.filter((item) => item.enabled).map((item) => item.capability))
      .toEqual(granted);
    expect(items.find((item) => item.capability === "CAP_PROJECT_DELETE"))
      .toEqual({ capability: "CAP_PROJECT_DELETE", enabled: false });
  });
});
