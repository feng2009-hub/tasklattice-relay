import { describe, expect, it } from "vitest";
import {
  instanceListGridTemplate,
  parseHiddenInstanceColumns,
  toggleHiddenInstanceColumn,
} from "./instance-list-columns";

describe("Instance list column preferences", () => {
  it("defaults safely when local storage does not contain a supported list", () => {
    expect(parseHiddenInstanceColumns(null)).toEqual([]);
    expect(parseHiddenInstanceColumns("not-json")).toEqual([]);
    expect(parseHiddenInstanceColumns('{"createdAt":false}')).toEqual([]);
  });

  it("keeps supported columns once and in the product-defined order", () => {
    expect(
      parseHiddenInstanceColumns(
        JSON.stringify(["updatedAt", "unknown", "createdAt", "updatedAt"]),
      ),
    ).toEqual(["createdAt", "updatedAt"]);
  });

  it("toggles a column without disturbing the stable column order", () => {
    expect(toggleHiddenInstanceColumn(["updatedAt"], "createdAt")).toEqual([
      "createdAt",
      "updatedAt",
    ]);
    expect(
      toggleHiddenInstanceColumn(["createdAt", "updatedAt"], "createdAt"),
    ).toEqual(["updatedAt"]);
  });

  it("removes hidden tracks while retaining the identity and actions tracks", () => {
    const visible = instanceListGridTemplate([]);
    const hidden = instanceListGridTemplate(["createdAt", "updatedAt"]);

    expect(visible).toContain("minmax(13rem,1.3fr)");
    expect(visible).toContain("minmax(7.5rem,.65fr)");
    expect(hidden).not.toContain("minmax(7.5rem,.65fr)");
    expect(hidden.endsWith("3rem")).toBe(true);
  });
});
