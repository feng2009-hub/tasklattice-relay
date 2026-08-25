import { describe, expect, it } from "vitest";
import { selectTriggerClassName } from "./select";

describe("select trigger sizing", () => {
  it("allows a feature row to override the default trigger height", () => {
    const className = selectTriggerClassName("default", "h-11 w-full");

    expect(className.split(" ")).toContain("h-11");
    expect(className.split(" ")).not.toContain("h-9");
  });

  it("keeps the semantic large size at the shared form-control height", () => {
    const className = selectTriggerClassName("lg");

    expect(className.split(" ")).toContain("h-11");
  });
});
