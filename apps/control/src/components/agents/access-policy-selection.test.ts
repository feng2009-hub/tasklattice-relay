import { describe, expect, it } from "vitest";
import {
  DEFAULT_ACCESS_POLICY_ID,
  type AccessPolicy,
} from "@tali/contracts";
import { activeDefaultAccessPolicyId } from "./access-policy-selection";

function policy(overrides: Partial<AccessPolicy> = {}): AccessPolicy {
  return {
    id: DEFAULT_ACCESS_POLICY_ID,
    name: "Default",
    status: "ACTIVE",
    serverRules: [],
    revision: 1,
    createdBy: "system:setup",
    createdAt: "2026-08-23T00:00:00.000Z",
    updatedAt: "2026-08-23T00:00:00.000Z",
    ...overrides,
  };
}

describe("activeDefaultAccessPolicyId", () => {
  it("selects the active Project default Access Policy", () => {
    expect(activeDefaultAccessPolicyId([policy()])).toBe(
      DEFAULT_ACCESS_POLICY_ID,
    );
  });

  it("does not preselect an inactive default policy", () => {
    expect(
      activeDefaultAccessPolicyId([policy({ status: "DRAFT" })]),
    ).toBeUndefined();
  });

  it("uses the stable default identity instead of the display name", () => {
    expect(
      activeDefaultAccessPolicyId([
        policy({ id: "11111111-1111-4111-8111-111111111111" }),
      ]),
    ).toBeUndefined();
  });
});
