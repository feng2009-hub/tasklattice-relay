import { getControlConfig } from "../config/control-config";
import { prisma } from "../db/prisma";
import { jsonResponse, problemResponse } from "../http/responses";
import { auth } from "./better-auth";

export type SystemRole = "user" | "super_administrator";

export interface AuthUser {
  displayName: string;
  email: string;
  hasPassword: boolean;
  id: string;
  systemRole: SystemRole;
  username: string;
}

export interface PlatformPrincipal {
  user: AuthUser;
}

export async function requireAuth(request: Request): Promise<PlatformPrincipal> {
  const session = await auth().api.getSession({ headers: request.headers });
  if (!session) throw new Error("Authentication required.");

  const user = await prisma().user.findUnique({
    where: { id: session.user.id },
    include: {
      authAccounts: {
        where: { providerId: "credential" },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!user || user.status !== "active") {
    throw new Error("The TaskLattice Relay account is disabled or unavailable.");
  }
  return {
    user: {
      displayName: user.displayName,
      email: user.email,
      hasPassword: user.authAccounts.length > 0,
      id: user.id,
      systemRole: user.systemRole,
      username: user.username ?? user.email,
    },
  };
}

export function unauthorizedResponse(error: unknown): Response {
  return problemResponse(
    401,
    error instanceof Error ? error.message : "Authentication required.",
  );
}

export function publicAuthConfig() {
  const config = getControlConfig();
  return {
    authRequired: true,
    developmentDefaults:
      !process.env.TALI_CONFIG && process.env.NODE_ENV !== "production",
    localEnabled: config.auth.local.enabled,
    mode: config.auth.oidc.enabled ? "local-sso" : "local",
    providerName: config.auth.oidc.enabled
      ? config.auth.oidc.display_name
      : "Company SSO",
    ssoEnabled: config.auth.oidc.enabled,
  } as const;
}

export async function handleAuthMe(request: Request): Promise<Response> {
  try {
    const principal = await requireAuth(request);
    return jsonResponse({
      identity: {
        type: "authenticated",
        userId: principal.user.id,
        username: principal.user.username,
      },
      user: principal.user,
    });
  } catch (error) {
    return unauthorizedResponse(error);
  }
}
