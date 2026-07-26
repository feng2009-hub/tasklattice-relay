import { describe, expect, it } from "vitest";
import { normalizeVirtualEmployeeName } from "./create-virtual-employee-sheet";

describe("normalizeVirtualEmployeeName", () => {
  it("derives a stable identifier from the single visible name", () => {
    expect(normalizeVirtualEmployeeName(" Research Assistant ")).toBe(
      "research-assistant",
    );
  });

  it("collapses punctuation and repeated separators", () => {
    expect(normalizeVirtualEmployeeName("Security / Review -- Agent")).toBe(
      "security-review-agent",
    );
  });

  it("rejects a name that cannot produce an identifier", () => {
    expect(normalizeVirtualEmployeeName("___")).toBe("");
  });
});
