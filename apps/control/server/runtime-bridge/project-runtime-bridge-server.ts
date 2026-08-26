import express from "express";
import { createServer } from "node:http";
import { z } from "zod";

const configuration = z.object({
  controlUrl: z.string().url(),
  projectId: z.string().min(1),
  projectToken: z.string().min(32),
  port: z.coerce.number().int().min(1).max(65_535),
}).parse({
  controlUrl: process.env.TALI_CONTROL_INTERNAL_URL,
  projectId: process.env.TALI_PROJECT_ID,
  projectToken: process.env.TALI_PROJECT_RUNTIME_TOKEN,
  port: process.env.PORT ?? "8080",
});

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "256kb", type: ["application/json", "application/a2a+json"] }));

function controlPath(coordinatorInstanceId: string, suffix = ""): string {
  return `/api/v1/runtime-bridge/coordinators/${encodeURIComponent(coordinatorInstanceId)}/agents${suffix}`;
}

async function controlRequest(
  path: string,
  coordinatorToken: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${configuration.projectToken}`);
  headers.set("x-tali-coordinator-token", coordinatorToken);
  return fetch(`${configuration.controlUrl.replace(/\/$/, "")}${path}`, {
    ...init,
    headers,
    redirect: "error",
    signal: AbortSignal.timeout(125_000),
  });
}

class CoordinatorAuthenticationError extends Error {}

function coordinatorToken(request: express.Request): string {
  const authorization = request.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ") || authorization.length <= 7) {
    throw new CoordinatorAuthenticationError(
      "Project Runtime Coordinator authentication is required.",
    );
  }
  return authorization.slice("Bearer ".length);
}

async function relay(response: Response, target: express.Response): Promise<void> {
  const body = await response.text();
  target.status(response.status);
  target.type(response.headers.get("content-type") ?? "application/json");
  target.send(body);
}

function bridgeAgentUrl(
  request: express.Request,
  coordinatorInstanceId: string,
  agentId: string,
): string {
  const configured = process.env.TALI_PROJECT_RUNTIME_BRIDGE_URL?.replace(/\/$/, "");
  const origin = configured ?? `${request.protocol}://${request.get("host")}`;
  return `${origin}/v1/a2a/coordinators/${encodeURIComponent(coordinatorInstanceId)}/agents/${encodeURIComponent(agentId)}`;
}

app.get("/healthz", (_request, response) => response.json({
  ok: true,
  projectId: configuration.projectId,
  capabilityKinds: ["A2A_AGENT"],
}));

app.get("/v1/agents", async (request, response, next) => {
  try {
    const coordinatorInstanceId = z.string().min(1).max(160).parse(
      request.query.coordinatorInstanceId,
    );
    await relay(
      await controlRequest(
        controlPath(coordinatorInstanceId),
        coordinatorToken(request),
      ),
      response,
    );
  } catch (error) {
    next(error);
  }
});

app.get("/v1/hermes/a2a-agents", async (request, response, next) => {
  try {
    const coordinatorInstanceId = z.string().min(1).max(160).parse(
      request.query.coordinatorInstanceId,
    );
    const token = coordinatorToken(request);
    const upstream = await controlRequest(controlPath(coordinatorInstanceId), token);
    const payload = await upstream.json() as {
      data?: Array<{
        id: string;
        skills: Array<{ id: string }>;
        timeoutSeconds: number;
      }>;
    };
    if (!upstream.ok) return void response.status(upstream.status).json(payload);
    response.json({
      a2a_agents: Object.fromEntries((payload.data ?? []).map((agent) => [
        agent.id,
        {
          url: bridgeAgentUrl(request, coordinatorInstanceId, agent.id),
          timeout: agent.timeoutSeconds,
          capabilities: agent.skills.map((skill) => skill.id),
          auth: { type: "bearer", token },
        },
      ])),
    });
  } catch (error) {
    next(error);
  }
});

const agentBase = "/v1/a2a/coordinators/:coordinatorInstanceId/agents/:agentId";
for (const cardPath of [
  `${agentBase}/.well-known/agent-card.json`,
  `${agentBase}/.well-known/agent.json`,
]) {
  app.get(cardPath, async (request, response, next) => {
    try {
      const coordinatorInstanceId = z.string().parse(request.params.coordinatorInstanceId);
      const agentId = z.string().parse(request.params.agentId);
      const publicEndpoint = bridgeAgentUrl(
        request,
        coordinatorInstanceId,
        agentId,
      );
      await relay(
        await controlRequest(
          `${controlPath(coordinatorInstanceId, `/${encodeURIComponent(agentId)}`)}/agent-card`,
          coordinatorToken(request),
          { headers: { "x-tali-bridge-agent-url": publicEndpoint } },
        ),
        response,
      );
    } catch (error) {
      next(error);
    }
  });
}

app.post(agentBase, async (request, response, next) => {
  try {
    const coordinatorInstanceId = z.string().parse(request.params.coordinatorInstanceId);
    const agentId = z.string().parse(request.params.agentId);
    await relay(
      await controlRequest(
        controlPath(coordinatorInstanceId, `/${encodeURIComponent(agentId)}`),
        coordinatorToken(request),
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "a2a-version": request.get("a2a-version") ?? "1.0",
          },
          body: JSON.stringify(request.body),
        },
      ),
      response,
    );
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error(error);
  response.status(
    error instanceof CoordinatorAuthenticationError
      ? 401
      : error instanceof z.ZodError
        ? 400
        : 502,
  ).json({
    error: error instanceof Error ? error.message : "Runtime Bridge request failed.",
  });
});

createServer(app).listen(configuration.port, "0.0.0.0", () => {
  console.log(JSON.stringify({
    event: "project-runtime-bridge.started",
    port: configuration.port,
    projectId: configuration.projectId,
  }));
});
