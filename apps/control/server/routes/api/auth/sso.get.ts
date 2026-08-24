import { defineHandler } from "nitro";
import { ssoAuth } from "../../../auth/better-auth";
import { problemResponse } from "../../../http/responses";

export default defineHandler(async (event) => {
  const requestUrl = new URL(event.req.url);
  const requestedCallback = requestUrl.searchParams.get("callbackURL") ?? "/";
  const callbackURL =
    requestedCallback.startsWith("/") && !requestedCallback.startsWith("//")
      ? requestedCallback
      : "/";

  const authResponse = await (await ssoAuth()).handler(
    new Request(new URL("/api/auth/sign-in/social", requestUrl.origin), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: requestUrl.origin,
      },
      body: JSON.stringify({
        callbackURL,
        disableRedirect: true,
        provider: "corporate-sso",
      }),
    }),
  );
  const payload = (await authResponse.json()) as {
    message?: string;
    url?: string;
  };
  if (!authResponse.ok || !payload.url) {
    return problemResponse(
      authResponse.status >= 400 ? authResponse.status : 502,
      payload.message ?? "Unable to start SSO authentication.",
      { code: "sso_start_failed" },
    );
  }

  const headers = new Headers({ location: payload.url });
  const stateCookie = authResponse.headers.get("set-cookie");
  if (stateCookie) headers.set("set-cookie", stateCookie);
  return new Response(null, { status: 302, headers });
});
