import { describe, expect, it } from "vitest";

import {
  filterMultiSelectOptions,
  type MultiSelectOption,
} from "./multi-select-options";

const options: MultiSelectOption[] = [
  { label: "Analytics", value: "analytics" },
  { label: "Code generation", meta: "Connected", metaTone: "success", value: "code-generation" },
  { label: "Artifact search", value: "artifact-search" },
];

describe("filterOptionsByPrefix", () => {
  it("lists every option for an empty query", () => {
    expect(filterMultiSelectOptions(options, "")).toEqual(options);
  });

  it("matches option labels by a case-insensitive substring", () => {
    expect(filterMultiSelectOptions(options, "  ART")).toEqual([options[2]]);
  });

  it("matches a query found in the middle of a label", () => {
    expect(filterMultiSelectOptions(options, "generation")).toEqual([options[1]]);
  });

  it("matches status labels without coupling filtering to their visual tone", () => {
    expect(filterMultiSelectOptions(options, "connected")).toEqual([options[1]]);
  });
});
