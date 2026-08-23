import {
  DEFAULT_ACCESS_POLICY_ID,
  type AccessPolicy,
} from "@tali/contracts";

export function activeDefaultAccessPolicyId(
  policies: readonly AccessPolicy[],
): string | undefined {
  return policies.find(
    (policy) =>
      policy.id === DEFAULT_ACCESS_POLICY_ID && policy.status === "ACTIVE",
  )?.id;
}
