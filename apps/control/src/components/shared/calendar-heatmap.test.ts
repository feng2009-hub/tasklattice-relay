import { describe, expect, it } from "vitest";
import { resolveCalendarMaxValue } from "./calendar-heatmap";

describe("resolveCalendarMaxValue", () => {
  it("preserves sub-dollar maxima so low spend remains visible", () => {
    expect(resolveCalendarMaxValue(0.01222189)).toBe(0.01222189);
  });

  it("uses a safe fallback only for an empty data set", () => {
    expect(resolveCalendarMaxValue(0)).toBe(1);
  });
});
