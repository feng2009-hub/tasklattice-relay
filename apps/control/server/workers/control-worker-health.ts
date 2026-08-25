import { createServer, type Server } from "node:http";
import { databaseHealth } from "../db/prisma";

export interface ControlWorkerHealthState {
  queueReady: boolean;
  startedAt: string;
  stopping: boolean;
  workerId: string;
}

function sendJson(
  response: import("node:http").ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>,
): void {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

export async function startControlWorkerHealthServer(
  state: ControlWorkerHealthState,
  port = Number(process.env.CONTROL_WORKER_HEALTH_PORT ?? 9090),
): Promise<Server> {
  const server = createServer(async (request, response) => {
    if (request.url === "/livez") {
      sendJson(response, state.stopping ? 503 : 200, {
        ok: !state.stopping,
        startedAt: state.startedAt,
        workerId: state.workerId,
      });
      return;
    }
    if (request.url === "/readyz") {
      try {
        if (!state.queueReady || state.stopping) {
          throw new Error("Control Worker queue is not ready.");
        }
        await databaseHealth();
        sendJson(response, 200, {
          database: "postgresql",
          ok: true,
          queue: "ready",
          workerId: state.workerId,
        });
      } catch (error) {
        sendJson(response, 503, {
          database: "unavailable",
          message: error instanceof Error ? error.message : String(error),
          ok: false,
          queue: state.queueReady ? "ready" : "starting",
          workerId: state.workerId,
        });
      }
      return;
    }
    sendJson(response, 404, { ok: false });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", () => resolve());
  });
  return server;
}

export async function stopControlWorkerHealthServer(
  server: Server,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
