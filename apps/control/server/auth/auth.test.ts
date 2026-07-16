import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  handleAuthMe,
  handleLocalLogin,
  handleSsoStart,
  publicAuthConfig,
  verifyAuthToken,
} from "./auth";

function localRequest(password: string) {
  return new Request("http://tasklattice.local/api/v1/auth/local", {
    body: JSON.stringify({ password, username: "operator" }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

describe("TaskLattice authentication", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv("TALI_AUTH_MODE", "local");
    vi.stubEnv("TALI_AUTH_JWT_SECRET", "test-secret-at-least-for-tests");
    vi.stubEnv("TALI_AUTH_LOCAL_USERNAME", "operator");
    vi.stubEnv("TALI_AUTH_LOCAL_PASSWORD", "correct-horse");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("authenticates a configured local user and resolves the bearer identity", async () => {
    const response = await handleLocalLogin(localRequest("correct-horse"));
    const body = (await response.json()) as {
      token: string;
      user: Record<string, unknown>;
    };

    expect(response.status).toBe(200);
    expect(body.user).toEqual({
      displayName: "Local Administrator",
      email: "",
      provider: "local",
      username: "operator",
    });
    expect(body.user).not.toHaveProperty("password");
    expect(body.user).not.toHaveProperty("passwordHash");
    expect(verifyAuthToken(body.token).sub).toBe("operator");
    expect(verifyAuthToken(body.token).user).toEqual(body.user);

    const me = handleAuthMe(
      new Request("http://tasklattice.local/api/v1/auth/me", {
        headers: { authorization: `Bearer ${body.token}` },
      }),
    );
    await expect(me.json()).resolves.toMatchObject({
      identity: { type: "authenticated", username: "operator" },
      user: { provider: "local", username: "operator" },
    });
  });

  it("rejects invalid local credentials", async () => {
    const response = await handleLocalLogin(localRequest("wrong"));
    await expect(response.json()).resolves.toMatchObject({
      error: "Login failed",
      message: "Invalid username or password.",
    });
    expect(response.status).toBe(401);
  });

  it("publishes local and SSO capabilities without leaking secrets", () => {
    vi.stubEnv("TALI_AUTH_MODE", "local-sso");
    vi.stubEnv("TALI_AUTH_OIDC_ISSUER", "https://identity.example/realms/agents");
    vi.stubEnv("TALI_AUTH_OIDC_CLIENT_ID", "tasklattice");
    vi.stubEnv("TALI_AUTH_OIDC_PROVIDER_NAME", "Example ID");

    expect(publicAuthConfig()).toEqual({
      authRequired: true,
      developmentDefaults: false,
      localEnabled: true,
      mode: "local-sso",
      providerName: "Example ID",
      ssoEnabled: true,
    });
  });

  it("starts OIDC authorization with PKCE, nonce, and a protected state cookie", async () => {
    vi.stubEnv("TALI_AUTH_MODE", "local-sso");
    vi.stubEnv("TALI_AUTH_OIDC_ISSUER", "https://identity.example/realms/agents");
    vi.stubEnv("TALI_AUTH_OIDC_CLIENT_ID", "tasklattice");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          authorization_endpoint: "https://identity.example/authorize",
          jwks_uri: "https://identity.example/jwks",
          token_endpoint: "https://identity.example/token",
        }),
      ),
    );

    const response = await handleSsoStart(
      new Request("http://tasklattice.local/api/v1/auth/sso/start"),
    );
    const location = new URL(response.headers.get("location") ?? "");

    expect(response.status).toBe(302);
    expect(location.searchParams.get("client_id")).toBe("tasklattice");
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(location.searchParams.get("code_challenge")).toBeTruthy();
    expect(location.searchParams.get("nonce")).toBeTruthy();
    expect(location.searchParams.get("redirect_uri")).toBe(
      "http://tasklattice.local/auth/sso/callback",
    );
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=Lax");
  });
});
