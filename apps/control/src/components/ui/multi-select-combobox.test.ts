import { describe, expect, it } from "vitest";

import {
  filterOptionsByPrefix,
  type MultiSelectOption,
} from "./multi-select-options";

const options: MultiSelectOption[] = [
  { label: "Analytics", value: "analytics" },
  { label: "Code generation", value: "code-generation" },
  { label: "Artifact search", value: "artifact-search" },
];

describe("filterOptionsByPrefix", () => {
  it("lists every option for an empty query", () => {
    expect(filterOptionsByPrefix(options, "")).toEqual(options);
  });

  it("matches option labels by a case-insensitive prefix", () => {
    expect(filterOptionsByPrefix(options, "  A")).toEqual([
      options[0],
      options[2],
    ]);
  });

  it("does not match a query found only in the middle of a label", () => {
    expect(filterOptionsByPrefix(options, "generation")).toEqual([]);
  });
});
