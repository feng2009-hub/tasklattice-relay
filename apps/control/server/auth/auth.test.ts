import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyPassword } from "better-auth/crypto";
import {
  developmentControlConfig,
  setControlConfigForTests,
} from "../config/control-config";
import { createTestPrisma } from "../test/prisma";
import {
  applyAuthenticationResponseHeaders,
  handleAuthMe,
  publicAuthConfig,
} from "./auth";
import {
  auth,
  authSessionIdleTimeoutSeconds,
  ensureInitialSuperAdministrator,
  resetBetterAuthForTests,
} from "./better-auth";
import { betterAuthSessionCookieName } from "./cookies";

function cookieHeader(response: Response): string {
  return (response.headers.get("set-cookie") ?? "")
    .split(/,(?=\s*[^;,]+=)/)
    .map((cookie) => cookie.split(";", 1)[0]?.trim())
    .filter(Boolean)
    .join("; ");
}

function signIn(password: string): Promise<Response> {
  return auth().handler(
    new Request("http://tali.local/api/auth/sign-in/username", {
      body: JSON.stringify({
        password,
        rememberMe: true,
        username: "admin",
      }),
      headers: {
        "content-type": "application/json",
        origin: "http://tali.local",
      },
      method: "POST",
    }),
  );
}

describe("Better Auth platform authentication", () => {
  const db = createTestPrisma();

  beforeEach(async () => {
    globalThis.taliPrisma = db;
    vi.stubEnv("TALI_CONFIG", "/test/control.toml");
    const config = developmentControlConfig();
    config.server.public_url = "http://tali.local";
    config.auth.local.initial_super_admin_password = "correct-horse-battery";
    setControlConfigForTests(config);
    resetBetterAuthForTests();
    await db.authSession.deleteMany();
    await db.authAccount.deleteMany();
    await ensureInitialSuperAdministrator();
  });

  afterEach(() => {
    resetBetterAuthForTests();
    setControlConfigForTests(undefined);
    vi.unstubAllEnvs();
  });

  it("signs in with a username and resolves the cookie-backed application principal", async () => {
    const response = await signIn("correct-horse-battery");
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=Lax");
    expect(response.headers.get("set-cookie")).toContain(
      `${betterAuthSessionCookieName}=`,
    );
    expect(response.headers.get("set-cookie")).not.toContain(
      "better-auth.session_token=",
    );
    expect(response.headers.get("set-cookie")).toContain(
      `Max-Age=${authSessionIdleTimeoutSeconds}`,
    );

    const request = new Request("http://tali.local/api/v1/auth/me", {
      headers: { cookie: cookieHeader(response) },
    });
    const me = await handleAuthMe(request);
    applyAuthenticationResponseHeaders(request, me);
    expect(me.status).toBe(200);
    expect(me.headers.get("set-cookie")).toContain(
      `${betterAuthSessionCookieName}=`,
    );
    expect(me.headers.get("set-cookie")).toContain(
      `Max-Age=${authSessionIdleTimeoutSeconds}`,
    );
    await expect(me.json()).resolves.toMatchObject({
      identity: { type: "authenticated", userId: "local-admin" },
      user: {
        hasPassword: true,
        id: "local-admin",
        systemRole: "super_administrator",
        username: "admin",
      },
    });
    await expect(db.authSession.count()).resolves.toBe(1);

    const defaultCookie = cookieHeader(response).replace(
      `${betterAuthSessionCookieName}=`,
      "better-auth.session_token=",
    );
    const defaultCookieMe = await handleAuthMe(
      new Request("http://tali.local/api/v1/auth/me", {
        headers: { cookie: defaultCookie },
      }),
    );
    expect(defaultCookieMe.status).toBe(401);
  });

  it("bootstraps the canonical admin / admin development credentials", async () => {
    const config = developmentControlConfig();
    config.server.public_url = "http://tali.local";
    expect(config.auth.local.initial_super_admin_username).toBe("admin");
    expect(config.auth.local.initial_super_admin_password).toBe("admin");

    setControlConfigForTests(config);
    resetBetterAuthForTests();
    await db.authSession.deleteMany();
    await db.authAccount.deleteMany();
    await ensureInitialSuperAdministrator();

    const response = await signIn("admin");
    expect(response.status).toBe(200);
  });

  it("rejects invalid credentials and does not accept the removed bearer-token protocol", async () => {
    const invalid = await signIn("incorrect-password");
    expect(invalid.status).toBe(401);

    const bearerOnly = await handleAuthMe(
      new Request("http://tali.local/api/v1/auth/me", {
        headers: { authorization: "Bearer legacy.jwt.token" },
      }),
    );
    expect(bearerOnly.status).toBe(401);
  });

  it("bootstraps one scrypt credential without rewriting it on restart", async () => {
    const first = await db.authAccount.findFirstOrThrow({
      where: { providerId: "credential", userId: "local-admin" },
    });
    expect(first.password).toBeTruthy();
    await expect(
      verifyPassword({
        hash: first.password!,
        password: "correct-horse-battery",
      }),
    ).resolves.toBe(true);

    const config = developmentControlConfig();
    config.server.public_url = "http://tali.local";
    config.auth.local.initial_super_admin_password = "different-password-value";
    setControlConfigForTests(config);
    await ensureInitialSuperAdministrator();

    const second = await db.authAccount.findUniqueOrThrow({
      where: { id: first.id },
    });
    expect(second.password).toBe(first.password);
  });

  it("publishes enabled login methods without exposing Better Auth secrets", () => {
    const config = developmentControlConfig();
    config.server.public_url = "http://tali.local";
    config.auth.oidc = {
      enabled: true,
      display_name: "Example ID",
      issuer: "https://identity.example/realms/agents",
      client_id: "tali",
      client_secret: "provider-secret",
    };
    setControlConfigForTests(config);

    expect(publicAuthConfig()).toEqual({
      authRequired: true,
      developmentDefaults: false,
      localEnabled: true,
      mode: "local-sso",
      providerName: "Example ID",
      ssoEnabled: true,
    });
    expect(JSON.stringify(publicAuthConfig())).not.toContain("provider-secret");
    expect(JSON.stringify(publicAuthConfig())).not.toContain(config.auth.secret);
  });

  it("requires one canonical public URL for every authentication mode", () => {
    const config = developmentControlConfig();
    delete config.server.public_url;
    setControlConfigForTests(config);
    resetBetterAuthForTests();
    expect(() => auth()).toThrow("server.public_url is required for Better Auth");
  });
});
