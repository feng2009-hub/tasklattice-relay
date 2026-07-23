import { z } from "zod";

const corsHeaders = {
  "access-control-allow-headers": "authorization, content-type, x-workspace-id",
  "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "access-control-allow-origin": process.env.TALI_CORS_ORIGIN ?? "*",
};

export function jsonResponse(
  body: unknown,
  init: ResponseInit = {},
): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  for (const [name, value] of Object.entries(corsHeaders))
    headers.set(name, value);
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function errorResponse(error: unknown): Response {
  console.error(error);
  if (error instanceof z.ZodError)
    return jsonResponse(
      { error: error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  const message = error instanceof Error ? error.message : "Unexpected error.";
  const status = /not found/i.test(message)
    ? 404
    : /access denied|do not have permission/i.test(message)
      ? 403
      : /Invalid |must be|before end_time/i.test(message)
        ? 400
    : /Consumer|default Inference Group|compliance|suspended|READY Inference Group|Multiple default/i.test(message)
      ? 409
      : /LiteLLM|gateway is unavailable/i.test(message)
        ? 503
        : 500;
  return jsonResponse({ error: message }, { status });
}

export function noContentResponse(): Response {
  return new Response(null, { status: 204, headers: corsHeaders });
}
