import {
  createHash,
  createHmac,
  createPublicKey,
  createVerify,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import bcrypt from "bcryptjs";
import { jsonResponse } from "../http/responses";

export type AuthMode = "local" | "local-sso";

export interface AuthUser {
  displayName: string;
  email: string;
  provider: "local" | "sso";
  username: string;
}

interface AuthConfig {
  developmentDefaults: boolean;
  jwtSecret: string;
  localUser: AuthUser & {
    password: string;
    passwordHash: string;
  };
  mode: AuthMode;
  oidc?: {
    clientId: string;
    clientSecret: string;
    issuer: string;
    providerName: string;
    redirectUri: string;
    scopes: string[];
  };
}

export interface AuthPayload {
  exp: number;
  iat: number;
  iss: string;
  sso?: { idToken: string };
  sub: string;
  user: AuthUser;
}

interface OidcDiscovery {
  authorization_endpoint: string;
  end_session_endpoint?: string;
  jwks_uri: string;
  token_endpoint: string;
}

interface OidcState {
  exp: number;
  nonce: string;
  redirect: string;
  state: string;
  verifier: string;
}

type OidcJwk = import("node:crypto").JsonWebKey & { kid?: string };

const issuer = "tasklattice";
const oidcCookie = "tasklattice_oidc";
const defaultDevSecret = "tasklattice-local-development-secret";

function requiredProductionValue(value: string | undefined, name: string): string {
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error(`${name} is required in production.`);
  }
  return "";
}

export function getAuthConfig(): AuthConfig {
  const mode = (process.env.TALI_AUTH_MODE ?? "local") as AuthMode;
  if (mode !== "local" && mode !== "local-sso") {
    throw new Error('TALI_AUTH_MODE must be "local" or "local-sso".');
  }

  const configuredPassword = process.env.TALI_AUTH_LOCAL_PASSWORD ?? "";
  const configuredHash = process.env.TALI_AUTH_LOCAL_PASSWORD_HASH ?? "";
  const productionPassword =
    configuredPassword || configuredHash
      ? ""
      : requiredProductionValue(undefined, "TALI_AUTH_LOCAL_PASSWORD_HASH");
  void productionPassword;
  const developmentDefaults = !configuredPassword && !configuredHash;
  const jwtSecret =
    process.env.TALI_AUTH_JWT_SECRET ||
    requiredProductionValue(undefined, "TALI_AUTH_JWT_SECRET") ||
    defaultDevSecret;

  const config: AuthConfig = {
    developmentDefaults,
    jwtSecret,
    localUser: {
      displayName: process.env.TALI_AUTH_LOCAL_DISPLAY_NAME ?? "Local Administrator",
      email: process.env.TALI_AUTH_LOCAL_EMAIL ?? "",
      password: configuredPassword || (developmentDefaults ? "admin" : ""),
      passwordHash: configuredHash,
      provider: "local",
      username: process.env.TALI_AUTH_LOCAL_USERNAME ?? "admin",
    },
    mode,
  };

  if (mode === "local-sso") {
    const oidcIssuer = process.env.TALI_AUTH_OIDC_ISSUER;
    const clientId = process.env.TALI_AUTH_OIDC_CLIENT_ID;
    if (!oidcIssuer || !clientId) {
      throw new Error(
        "local-sso mode requires TALI_AUTH_OIDC_ISSUER and TALI_AUTH_OIDC_CLIENT_ID.",
      );
    }
    config.oidc = {
      clientId,
      clientSecret: process.env.TALI_AUTH_OIDC_CLIENT_SECRET ?? "",
      issuer: oidcIssuer.replace(/\/$/, ""),
      providerName: process.env.TALI_AUTH_OIDC_PROVIDER_NAME ?? "Company SSO",
      redirectUri: process.env.TALI_AUTH_OIDC_REDIRECT_URI ?? "",
      scopes: (process.env.TALI_AUTH_OIDC_SCOPES ?? "openid profile email")
        .split(/\s+/)
        .filter(Boolean),
    };
  }

  return config;
}

function base64Url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function decodeBase64Url(input: string): Buffer {
  return Buffer.from(input, "base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function signature(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function signAuthToken(
  authUser: AuthUser,
  remember = false,
  idToken = "",
): { expiresAt: string; token: string; user: AuthUser } {
  const config = getAuthConfig();
  const now = Math.floor(Date.now() / 1_000);
  const user: AuthUser = {
    displayName: authUser.displayName,
    email: authUser.email,
    provider: authUser.provider,
    username: authUser.username,
  };
  const payload: AuthPayload = {
    exp: now + (remember ? 30 * 86_400 : 8 * 3_600),
    iat: now,
    iss: issuer,
    ...(idToken ? { sso: { idToken } } : {}),
    sub: user.username,
    user,
  };
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64Url(JSON.stringify(payload));
  const unsigned = `${header}.${body}`;
  return {
    expiresAt: new Date(payload.exp * 1_000).toISOString(),
    token: `${unsigned}.${signature(unsigned, config.jwtSecret)}`,
    user,
  };
}

export function verifyAuthToken(token: string): AuthPayload {
  const [header, body, suppliedSignature] = token.split(".");
  if (!header || !body || !suppliedSignature) {
    throw new Error("Missing or invalid authentication token.");
  }
  const unsigned = `${header}.${body}`;
  if (!safeEqual(suppliedSignature, signature(unsigned, getAuthConfig().jwtSecret))) {
    throw new Error("Invalid authentication token signature.");
  }
  const payload = JSON.parse(decodeBase64Url(body).toString("utf8")) as AuthPayload;
  if (payload.iss !== issuer) throw new Error("Invalid authentication token issuer.");
  if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1_000)) {
    throw new Error("Authentication token expired.");
  }
  return payload;
}

export function bearerToken(request: Request): string {
  return request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
}

export function requireAuth(request: Request): AuthPayload {
  const token = bearerToken(request);
  if (!token) throw new Error("Authentication required.");
  return verifyAuthToken(token);
}

export function unauthorizedResponse(error: unknown): Response {
  return jsonResponse(
    {
      error: "Unauthorized",
      message: error instanceof Error ? error.message : "Authentication required.",
    },
    { status: 401 },
  );
}

export function publicAuthConfig() {
  const config = getAuthConfig();
  return {
    authRequired: true,
    developmentDefaults: config.developmentDefaults,
    localEnabled: true,
    mode: config.mode,
    providerName: config.oidc?.providerName ?? "Company SSO",
    ssoEnabled: config.mode === "local-sso",
  };
}

async function validLocalPassword(password: string, config: AuthConfig): Promise<boolean> {
  if (config.localUser.passwordHash) {
    return bcrypt.compare(password, config.localUser.passwordHash);
  }
  return safeEqual(password, config.localUser.password);
}

export async function handleLocalLogin(request: Request): Promise<Response> {
  try {
    const config = getAuthConfig();
    const body = (await request.json()) as {
      password?: string;
      remember?: boolean;
      username?: string;
    };
    const usernameMatches = safeEqual(
      body.username ?? "",
      config.localUser.username,
    );
    const passwordMatches = await validLocalPassword(body.password ?? "", config);
    if (!usernameMatches || !passwordMatches) {
      return jsonResponse(
        { error: "Login failed", message: "Invalid username or password." },
        { status: 401 },
      );
    }
    return jsonResponse(signAuthToken(config.localUser, Boolean(body.remember)));
  } catch (error) {
    return jsonResponse(
      {
        error: "Login failed",
        message: error instanceof Error ? error.message : "Unable to sign in.",
      },
      { status: 500 },
    );
  }
}

async function oidcDiscovery(config: AuthConfig): Promise<OidcDiscovery> {
  if (!config.oidc) throw new Error("SSO is not configured.");
  const discoveryUrl = `${config.oidc.issuer}/.well-known/openid-configuration`;
  let response: Response;
  try {
    response = await fetch(discoveryUrl);
  } catch (error) {
    throw new Error(
      `Unable to reach the OIDC discovery document at ${discoveryUrl}: ${
        error instanceof Error ? error.message : "network error"
      }`,
    );
  }
  if (!response.ok) {
    throw new Error(
      `OIDC discovery failed at ${discoveryUrl}: HTTP ${response.status} ${response.statusText}`.trim(),
    );
  }
  return (await response.json()) as OidcDiscovery;
}

function callbackUrl(request: Request, config: AuthConfig): string {
  if (config.oidc?.redirectUri) return config.oidc.redirectUri;
  return `${new URL(request.url).origin}/auth/sso/callback`;
}

function signOidcState(state: OidcState, secret: string): string {
  const body = base64Url(JSON.stringify(state));
  return `${body}.${signature(body, secret)}`;
}

function verifyOidcState(value: string, secret: string): OidcState {
  const [body, suppliedSignature] = value.split(".");
  if (!body || !suppliedSignature || !safeEqual(suppliedSignature, signature(body, secret))) {
    throw new Error("Invalid SSO state cookie.");
  }
  const state = JSON.parse(decodeBase64Url(body).toString("utf8")) as OidcState;
  if (state.exp <= Math.floor(Date.now() / 1_000)) throw new Error("SSO state expired.");
  return state;
}

function cookieValue(request: Request, name: string): string {
  const cookies = request.headers.get("cookie") ?? "";
  for (const entry of cookies.split(";")) {
    const [key, ...parts] = entry.trim().split("=");
    if (key === name) return decodeURIComponent(parts.join("="));
  }
  return "";
}

function oidcCookieHeader(value: string, request: Request, maxAge = 600): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${oidcCookie}=${encodeURIComponent(value)}; Path=/auth/sso; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function safeRedirect(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

export async function handleSsoStart(request: Request): Promise<Response> {
  try {
    const config = getAuthConfig();
    if (config.mode !== "local-sso" || !config.oidc) {
      return jsonResponse({ error: "SSO disabled" }, { status: 404 });
    }
    const discovery = await oidcDiscovery(config);
    const state = randomBytes(24).toString("base64url");
    const nonce = randomBytes(24).toString("base64url");
    const verifier = randomBytes(48).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const returnPath = safeRedirect(new URL(request.url).searchParams.get("redirect"));
    const stateCookie = signOidcState(
      {
        exp: Math.floor(Date.now() / 1_000) + 600,
        nonce,
        redirect: returnPath,
        state,
        verifier,
      },
      config.jwtSecret,
    );
    const redirect = new URL(discovery.authorization_endpoint);
    redirect.searchParams.set("client_id", config.oidc.clientId);
    redirect.searchParams.set("code_challenge", challenge);
    redirect.searchParams.set("code_challenge_method", "S256");
    redirect.searchParams.set("nonce", nonce);
    redirect.searchParams.set("redirect_uri", callbackUrl(request, config));
    redirect.searchParams.set("response_type", "code");
    redirect.searchParams.set("scope", config.oidc.scopes.join(" "));
    redirect.searchParams.set("state", state);
    return new Response(null, {
      headers: {
        location: redirect.toString(),
        "set-cookie": oidcCookieHeader(stateCookie, request),
      },
      status: 302,
    });
  } catch (error) {
    return jsonResponse(
      {
        error: "SSO start failed",
        message: error instanceof Error ? error.message : "Unable to start SSO.",
      },
      { status: 500 },
    );
  }
}

async function verifyOidcToken(
  idToken: string,
  expectedNonce: string,
  config: AuthConfig,
  discovery: OidcDiscovery,
): Promise<Record<string, unknown>> {
  if (!config.oidc) throw new Error("SSO is not configured.");
  const [encodedHeader, encodedPayload, encodedSignature] = idToken.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new Error("OIDC provider returned an invalid ID token.");
  }
  const header = JSON.parse(decodeBase64Url(encodedHeader).toString("utf8")) as {
    alg?: string;
    kid?: string;
  };
  if (header.alg !== "RS256") throw new Error(`Unsupported OIDC signing algorithm: ${header.alg ?? "unknown"}.`);
  const payload = JSON.parse(decodeBase64Url(encodedPayload).toString("utf8")) as Record<string, unknown>;
  const jwksResponse = await fetch(discovery.jwks_uri);
  if (!jwksResponse.ok) throw new Error("Unable to load OIDC signing keys.");
  const jwks = (await jwksResponse.json()) as { keys?: OidcJwk[] };
  const key = jwks.keys?.find((candidate) => candidate.kid === header.kid);
  if (!key) throw new Error("OIDC signing key was not found.");
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${encodedHeader}.${encodedPayload}`);
  if (!verifier.verify(createPublicKey({ format: "jwk", key }), decodeBase64Url(encodedSignature))) {
    throw new Error("OIDC token signature verification failed.");
  }
  const audience = payload.aud;
  const audienceMatches =
    audience === config.oidc.clientId ||
    (Array.isArray(audience) && audience.includes(config.oidc.clientId));
  if (payload.iss !== config.oidc.issuer) throw new Error("OIDC token issuer mismatch.");
  if (!audienceMatches) throw new Error("OIDC token audience mismatch.");
  if (payload.nonce !== expectedNonce) throw new Error("OIDC token nonce mismatch.");
  if (typeof payload.exp !== "number" || payload.exp <= Math.floor(Date.now() / 1_000)) {
    throw new Error("OIDC token expired.");
  }
  return payload;
}

export async function handleSsoCallback(request: Request): Promise<Response> {
  const url = new URL(request.url);
  try {
    const config = getAuthConfig();
    if (config.mode !== "local-sso" || !config.oidc) throw new Error("SSO is disabled.");
    const stateCookie = verifyOidcState(
      cookieValue(request, oidcCookie),
      config.jwtSecret,
    );
    const code = url.searchParams.get("code") ?? "";
    const state = url.searchParams.get("state") ?? "";
    if (!code || !safeEqual(state, stateCookie.state)) throw new Error("Invalid SSO callback state.");
    const discovery = await oidcDiscovery(config);
    const tokenResponse = await fetch(discovery.token_endpoint, {
      body: new URLSearchParams({
        client_id: config.oidc.clientId,
        ...(config.oidc.clientSecret
          ? { client_secret: config.oidc.clientSecret }
          : {}),
        code,
        code_verifier: stateCookie.verifier,
        grant_type: "authorization_code",
        redirect_uri: callbackUrl(request, config),
      }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
    });
    if (!tokenResponse.ok) throw new Error(`OIDC token exchange failed with HTTP ${tokenResponse.status}.`);
    const tokenSet = (await tokenResponse.json()) as { id_token?: string };
    if (!tokenSet.id_token) throw new Error("OIDC provider did not return an ID token.");
    const claims = await verifyOidcToken(
      tokenSet.id_token,
      stateCookie.nonce,
      config,
      discovery,
    );
    const username = String(
      claims.preferred_username ?? claims.email ?? claims.sub ?? "sso-user",
    );
    const signed = signAuthToken(
      {
        displayName: String(claims.name ?? username),
        email: String(claims.email ?? ""),
        provider: "sso",
        username,
      },
      false,
      tokenSet.id_token,
    );
    const redirect = new URL("/auth/sso-complete", url.origin);
    redirect.hash = new URLSearchParams({
      redirect: stateCookie.redirect,
      token: signed.token,
    }).toString();
    return new Response(null, {
      headers: {
        location: redirect.toString(),
        "set-cookie": oidcCookieHeader("", request, 0),
      },
      status: 302,
    });
  } catch (error) {
    const redirect = new URL("/login", url.origin);
    redirect.searchParams.set(
      "error",
      error instanceof Error ? error.message : "SSO login failed.",
    );
    return new Response(null, {
      headers: {
        location: redirect.toString(),
        "set-cookie": oidcCookieHeader("", request, 0),
      },
      status: 302,
    });
  }
}

export function handleAuthMe(request: Request): Response {
  try {
    const payload = requireAuth(request);
    return jsonResponse({
      identity: { type: "authenticated", username: payload.sub },
      user: payload.user,
    });
  } catch (error) {
    return unauthorizedResponse(error);
  }
}

export async function handleLogout(request: Request): Promise<Response> {
  try {
    const payload = requireAuth(request);
    if (payload.user.provider === "sso" && payload.sso?.idToken) {
      const config = getAuthConfig();
      const discovery = await oidcDiscovery(config);
      if (discovery.end_session_endpoint) {
        const redirect = new URL(discovery.end_session_endpoint);
        redirect.searchParams.set("id_token_hint", payload.sso.idToken);
        redirect.searchParams.set("post_logout_redirect_uri", `${new URL(request.url).origin}/login`);
        return jsonResponse({ message: "Logged out", redirectUrl: redirect.toString() });
      }
    }
  } catch {
    // Client-side token removal remains the logout source of truth.
  }
  return jsonResponse({ message: "Logged out" });
}
