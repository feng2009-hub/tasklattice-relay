import { describe, expect, it } from "vitest";
import { lifecycleActionForStatus } from "./project-virtual-employees";

describe("lifecycleActionForStatus", () => {
  it("suspends an active Virtual Employee", () => {
    expect(lifecycleActionForStatus("active")).toBe("suspend");
  });

  it("retries provisioning after an error", () => {
    expect(lifecycleActionForStatus("error")).toBe("provision");
  });

  it("does not offer a competing action while provisioning", () => {
    expect(lifecycleActionForStatus("provisioning")).toBeNull();
  });

  it.each(["draft", "pending_approval", "suspended", "expired"] as const)(
    "activates a %s Virtual Employee",
    (status) => {
      expect(lifecycleActionForStatus(status)).toBe("activate");
    },
  );
});
