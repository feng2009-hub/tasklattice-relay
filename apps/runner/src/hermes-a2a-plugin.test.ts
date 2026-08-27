import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Relay Hermes A2A plugin", () => {
  it("passes its protocol and transport compatibility tests", () => {
    const tests = resolve(
      import.meta.dirname,
      "../../../runtime-integrations/hermes-a2a-plugin/tests",
    );
    const result = spawnSync(
      "python3",
      ["-m", "unittest", "discover", "-s", tests, "-p", "test_*.py"],
      { encoding: "utf8" },
    );
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  });
});
