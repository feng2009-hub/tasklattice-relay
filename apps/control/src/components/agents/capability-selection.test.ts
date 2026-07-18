import { describe, expect, it } from "vitest";
import {
  changeSpecializationSelection,
  previewSpecializationChange,
  specializationSelections,
  updateCapabilitySelection,
} from "./capability-selection";

describe("capability selection sources", () => {
  it("marks newly selected capabilities as manual and preserves existing sources", () => {
    expect(updateCapabilitySelection(
      specializationSelections(["policy-search", "onboarding"]),
      ["policy-search", "data-extraction"],
    )).toEqual([
      { id: "policy-search", source: "specialization" },
      { id: "data-extraction", source: "manual" },
    ]);
  });

  it("replaces specialization defaults while preserving manual additions", () => {
    expect(changeSpecializationSelection([
      { id: "policy-search", source: "specialization" },
      { id: "data-extraction", source: "manual" },
    ], ["web-research", "citation-builder", "data-extraction"])).toEqual([
      { id: "data-extraction", source: "manual" },
      { id: "web-research", source: "specialization" },
      { id: "citation-builder", source: "specialization" },
    ]);
  });

  it("describes remove, add, and keep effects before a specialization change", () => {
    expect(previewSpecializationChange([
      { id: "policy-search", source: "specialization" },
      { id: "onboarding", source: "specialization" },
      { id: "data-extraction", source: "manual" },
    ], ["web-research", "citation-builder"])).toEqual({
      remove: ["policy-search", "onboarding"],
      add: ["web-research", "citation-builder"],
      keep: ["data-extraction"],
    });
  });
});
