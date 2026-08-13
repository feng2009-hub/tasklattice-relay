import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("Control Plane typography contract", () => {
  it("defines display, interface, and technical font roles", () => {
    expect(styles).toContain("--font-display:");
    expect(styles).toContain("--font-sans:");
    expect(styles).toContain("--font-mono:");
    expect(styles).not.toContain("--font-heading:");
  });

  it("does not assign a font family from heading level", () => {
    expect(styles).not.toMatch(/h1,\s*h2,\s*h3/);
  });

  it("uses the technical font for native code elements", () => {
    expect(styles).toMatch(/code,\s*kbd,\s*samp,\s*pre\s*{\s*@apply font-mono;/);
  });
});
