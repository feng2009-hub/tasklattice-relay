import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { hashPassword } from "better-auth/crypto";
import { createLocalAccountIssuer } from "better-auth/db";
import { genericOAuth, username } from "better-auth/plugins";
import { getControlConfig } from "../config/control-config";
import { prisma } from "../db/prisma";
import { betterAuthCookiePrefix } from "./cookies";

const oidcProviderId = "corporate-sso";

export const authSessionIdleTimeoutSeconds = 30 * 60;
export const authSessionUpdateAgeSeconds = 0;

function createBetterAuth() {
  const config = getControlConfig();
  const baseURL = config.server.public_url;
  if (!baseURL) throw new Error("server.public_url is required for Better Auth.");

  return betterAuth({
    appName: "TaskLattice Relay",
    baseURL,
    basePath: "/api/auth",
    secret: config.auth.secret,
    trustedOrigins: [baseURL],
    advanced: { cookiePrefix: betterAuthCookiePrefix },
    database: prismaAdapter(prisma(), {
      provider: "postgresql",
      transaction: true,
    }),
    emailAndPassword: {
      enabled: config.auth.local.enabled,
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    user: {
      modelName: "User",
      fields: { name: "displayName" },
      additionalFields: {
        language: {
          type: "string",
          defaultValue: "en-US",
          input: false,
          returned: true,
        },
        timezone: {
          type: "string",
          defaultValue: "UTC",
          input: false,
          returned: true,
        },
        theme: {
          type: "string",
          defaultValue: "system",
          input: false,
          returned: true,
        },
        systemRole: {
          type: ["user", "super_administrator"],
          defaultValue: "user",
          input: false,
          returned: true,
        },
        status: {
          type: ["active", "disabled"],
          defaultValue: "active",
          input: false,
          returned: true,
        },
      },
    },
    session: {
      modelName: "AuthSession",
      expiresIn: authSessionIdleTimeoutSeconds,
      updateAge: authSessionUpdateAgeSeconds,
    },
    account: { modelName: "AuthAccount" },
    verification: { modelName: "AuthVerification" },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const user = await prisma().user.findUnique({
              where: { id: session.userId },
              select: { status: true },
            });
            return user?.status === "active";
          },
        },
      },
    },
    plugins: [
      username({
        displayUsername: false,
        immutableUsername: true,
        minUsernameLength: 3,
        maxUsernameLength: 64,
        usernameValidator: (value) => /^[a-zA-Z0-9._-]+$/.test(value),
      }),
      genericOAuth({
        config: config.auth.oidc.enabled
          ? [
              {
                providerId: oidcProviderId,
                name: config.auth.oidc.display_name,
                discoveryUrl: `${config.auth.oidc.issuer.replace(/\/$/, "")}/.well-known/openid-configuration`,
                clientId: config.auth.oidc.client_id,
                clientSecret: config.auth.oidc.client_secret,
                scopes: ["openid", "profile", "email"],
                requireIdTokenVerification: true,
                postLogoutRedirectURI: `${baseURL.replace(/\/$/, "")}/login`,
                mapProfileToUser: (profile) => ({
                  name:
                    typeof profile.name === "string" && profile.name.trim()
                      ? profile.name
                      : typeof profile.email === "string"
                        ? profile.email
                        : "SSO User",
                  emailVerified: profile.email_verified === true,
                }),
              },
            ]
          : [],
      }),
    ],
  });
}

export type BetterAuthInstance = ReturnType<typeof createBetterAuth>;

declare global {
  var taliBetterAuth: BetterAuthInstance | undefined;
}

export function auth(): BetterAuthInstance {
  globalThis.taliBetterAuth ??= createBetterAuth();
  return globalThis.taliBetterAuth;
}

export function resetBetterAuthForTests(): void {
  globalThis.taliBetterAuth = undefined;
}

export async function ensureInitialSuperAdministrator(): Promise<void> {
  const local = getControlConfig().auth.local;
  if (!local.enabled) return;
  const username = local.initial_super_admin_username;
  const email = local.initial_super_admin_email;
  const password = local.initial_super_admin_password;
  if (!username || !email || !password) {
    throw new Error(
      "Local authentication requires an initial Super Administrator username, email, and password.",
    );
  }

  const administrator = await prisma().user.upsert({
    where: { id: "local-admin" },
    create: {
      id: "local-admin",
      username,
      email,
      emailVerified: true,
      displayName: "Super Administrator",
      systemRole: "super_administrator",
      status: "active",
    },
    update: {
      username,
      email,
      emailVerified: true,
      systemRole: "super_administrator",
      status: "active",
    },
  });

  const issuer = createLocalAccountIssuer("credential");
  const existingCredential = await prisma().authAccount.findUnique({
    where: { issuer_accountId: { issuer, accountId: administrator.id } },
  });
  if (existingCredential) return;

  await prisma().authAccount.create({
    data: {
      id: randomUUID(),
      userId: administrator.id,
      providerId: "credential",
      issuer,
      accountId: administrator.id,
      password: await hashPassword(password),
    },
  });
}

export const betterAuthOidcProviderId = oidcProviderId;
