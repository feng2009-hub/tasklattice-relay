import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { getControlConfig } from "../config/control-config";

const validationLifetimeSeconds = 5 * 60;

function payloadDigest(payload: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("base64url");
}

function signature(scope: string, expiresAt: number, digest: string): string {
  return createHmac("sha256", getControlConfig().auth.secret)
    .update(`${scope}.${expiresAt}.${digest}`)
    .digest("base64url");
}

export function issuePlatformSettingsValidation(
  scope: "infrastructure" | "security",
  payload: unknown,
): { expiresAt: string; validatedAt: string; validationToken: string } {
  const now = Math.floor(Date.now() / 1_000);
  const expiresAt = now + validationLifetimeSeconds;
  const digest = payloadDigest(payload);
  return {
    expiresAt: new Date(expiresAt * 1_000).toISOString(),
    validatedAt: new Date(now * 1_000).toISOString(),
    validationToken: `${expiresAt}.${digest}.${signature(scope, expiresAt, digest)}`,
  };
}

export function assertPlatformSettingsValidation(
  scope: "infrastructure" | "security",
  payload: unknown,
  token: string,
): void {
  const [expiresAtText, suppliedDigest, suppliedSignature] = token.split(".");
  const expiresAt = Number(expiresAtText);
  if (
    !Number.isInteger(expiresAt)
    || !suppliedDigest
    || !suppliedSignature
    || expiresAt <= Math.floor(Date.now() / 1_000)
  ) {
    throw new Error("The configuration validation expired. Validate the draft again before saving.");
  }
  const expectedDigest = payloadDigest(payload);
  const expectedSignature = signature(scope, expiresAt, expectedDigest);
  const digestMatches = Buffer.byteLength(suppliedDigest) === Buffer.byteLength(expectedDigest)
    && timingSafeEqual(Buffer.from(suppliedDigest), Buffer.from(expectedDigest));
  const signatureMatches = Buffer.byteLength(suppliedSignature) === Buffer.byteLength(expectedSignature)
    && timingSafeEqual(Buffer.from(suppliedSignature), Buffer.from(expectedSignature));
  if (!digestMatches || !signatureMatches) {
    throw new Error("The configuration changed after validation. Validate the current draft before saving.");
  }
}
