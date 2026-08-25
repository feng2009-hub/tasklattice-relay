import { createHmac, timingSafeEqual } from "node:crypto";
import { getControlConfig } from "../config/control-config";
import type { PrismaClient } from "../generated/prisma/client";
import { loadPlatformRuntimeConfiguration } from "../platform/platform-runtime-config";

const bridgePurpose = "tali:vector-store-bridge:v1";

export function vectorStoreBridgeApiKey(): string {
  return createHmac("sha256", getControlConfig().auth.secret)
    .update(bridgePurpose)
    .digest("hex");
}

export async function vectorStoreBridgeApiBase(
  projectId: string,
  db?: PrismaClient,
): Promise<string> {
  const controlUrl = (await loadPlatformRuntimeConfiguration(db)).controlInternalUrl;
  if (!controlUrl) {
    throw new Error(
      "The Vector Store bridge requires a Control internal URL in Platform Infrastructure settings.",
    );
  }
  return `${controlUrl.replace(/\/+$/, "")}/api/internal/vector-stores/${encodeURIComponent(projectId)}`;
}

export function isVectorStoreBridgeAuthorized(authorization: string | null): boolean {
  const expected = Buffer.from(`Bearer ${vectorStoreBridgeApiKey()}`);
  const actual = Buffer.from(authorization ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
