import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const seedSource = await readFile(
  fileURLToPath(new URL("../../prisma/seed-built-in-skills.mjs", import.meta.url)),
  "utf8",
);

describe("Vendor Skill seed", () => {
  it("targets the canonical Prisma database schema", () => {
    expect(seedSource).toContain("tasklattice.skill_artifacts");
    expect(seedSource).toContain("tasklattice.skills");
    expect(seedSource).not.toMatch(/\btali\.(?:skill_artifacts|skills)\b/);
  });
});
