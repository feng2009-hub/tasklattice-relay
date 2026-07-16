import express from "express";
import {
  parseTerminalResize,
  type ProvisioningStage,
  type RunnerSandbox,
} from "@tasklattice/contracts";
import { createServer } from "node:http";
import type { Duplex } from "node:stream";
import * as pty from "node-pty";
import { WebSocket, WebSocketServer } from "ws";
import { z } from "zod";
import {
  installAgentInstructions,
  nemoClawTerminalArguments,
  onboardCommand,
  runCommand,
  verifyDeepSeek,
  type ProvisionInput,
} from "./nemoclaw.js";
import {
  deleteOpenShellSandbox,
  deleteOpenShellWebUiEndpoint,
  ensureOpenShellWebUiEndpoint,
  getOpenShellAuditEvents,
  observeOpenShellSandbox,
  openShellArguments,
  openShellBinary,
  openShellTerminalArguments,
  provisionOpenShellSandbox,
} from "./openshell.js";

type Phase = RunnerSandbox["phase"];
type SandboxState = RunnerSandbox;

const app = express();
const server = createServer(app);
const sockets = new WebSocketServer({ noServer: true });
const port = Number(process.env.PORT ?? 9090);
const host = process.env.HOST ?? "127.0.0.1";
const token = process.env.NEMOCLAW_RUNNER_TOKEN ?? "local-dev-token";
const mode = process.env.NEMOCLAW_RUNNER_MODE ?? "nemoclaw";
const isOpenShell = mode === "openshell-kubernetes";
const states = new Map<string, SandboxState>();
const activeProvisions = new Set<string>();
const createSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9-]{0,61}[a-z0-9]$/),
  provider: z.literal("deepseek"),
  model: z.enum(["deepseek-chat", "deepseek-reasoner"]),
  systemPrompt: z.string().min(10).max(8000),
  policyYaml: z.string().min(10).max(64_000),
  apiKey: z.string().min(16).max(512).optional(),
});

function authorized(header: string | undefined): boolean {
  return header === `Bearer ${token}`;
}
function responseState(state: SandboxState): SandboxState {
  return state;
}

function updateProvisioningStage(
  state: SandboxState,
  stage: ProvisioningStage,
  message?: string,
): void {
  state.provisioningStage = stage;
  if (message && state.logs.at(-1) !== message) state.logs.push(message);
}

function rejectTerminalUpgrade(
  socket: Duplex,
  status: number,
  message: string,
): void {
  const body = `${message}\n`;
  socket.end(
    `HTTP/1.1 ${status} ${status === 401 ? "Unauthorized" : "Conflict"}\r\n` +
      "Connection: close\r\n" +
      "Content-Type: text/plain; charset=utf-8\r\n" +
      `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
  );
}

async function readySandboxState(
  name: string,
): Promise<SandboxState | undefined> {
  const local = states.get(name);
  if (local?.phase === "READY") return local;
  if (!isOpenShell) return undefined;

  const observed = await observeOpenShellSandbox(name);
  if (observed?.phase.toLowerCase() !== "ready") return undefined;
  const recovered: SandboxState = {
    name,
    phase: "READY",
    provisioningStage: "READY",
    logs: local?.logs ?? [],
  };
  states.set(name, recovered);
  return recovered;
}

async function provision(
  input: ProvisionInput,
  operationId: string,
): Promise<void> {
  activeProvisions.add(input.name);
  const state = states.get(input.name);
  if (!state) {
    activeProvisions.delete(input.name);
    return;
  }
  try {
    let httpEndpoint: RunnerSandbox["httpEndpoint"];
    if (process.env.DEEPSEEK_VERIFY_ON_CREATE === "1") {
      await verifyDeepSeek(input);
      state.logs.push("DeepSeek provider preflight succeeded through AI SDK.");
    }
    if (mode === "fixture") {
      const fixtureStages: ReadonlyArray<[ProvisioningStage, string]> = [
        ["PROVIDER", "Fixture provider configuration accepted."],
        ["SANDBOX", "Fixture Sandbox policy applied."],
        ["POD", "Fixture Kubernetes Pod created and initializing."],
        ["RUNTIME", "Fixture NemoClaw services starting inside the Pod."],
        ["ENDPOINT", "Fixture Web UI endpoint publishing."],
      ];
      const fixtureDelayMs = Number(
        process.env.NEMOCLAW_FIXTURE_PROVISION_DELAY_MS ?? "350",
      );
      for (const [stage, message] of fixtureStages) {
        updateProvisioningStage(state, stage, message);
        await new Promise((resolve) =>
          setTimeout(resolve, fixtureDelayMs / fixtureStages.length),
        );
      }
      state.logs.push(
        "Fixture host accepted the typed NemoClaw provisioning request.",
        "Sandbox phase: Ready",
      );
    } else if (isOpenShell) {
      await provisionOpenShellSandbox(input, {
        onStage: (stage, message) => updateProvisioningStage(state, stage, message),
        onLog: (lines) => state.logs.push(...lines),
      });
      updateProvisioningStage(state, "RUNTIME", "Initializing NemoClaw services inside the Pod.");
      state.logs.push(
        "OpenClaw Agent instructions uploaded to the sandbox workspace.",
        "NemoClaw supervisor started the OpenClaw Agent gateway.",
        "OpenClaw gateway health check: Ready",
      );
      try {
        updateProvisioningStage(state, "ENDPOINT", "Publishing the OpenClaw Web UI endpoint.");
        httpEndpoint = {
          kind: "openclaw-webui",
          status: "READY",
          url: await ensureOpenShellWebUiEndpoint(input.name),
        };
        state.logs.push("OpenClaw Web UI exposed through OpenShell service routing.");
      } catch (error) {
        httpEndpoint = {
          kind: "openclaw-webui",
          status: "UNAVAILABLE",
          reason:
            error instanceof Error
              ? error.message
              : "Unable to expose the OpenClaw Web UI.",
        };
        state.logs.push(`OpenClaw Web UI unavailable: ${httpEndpoint.reason}`);
      }
    } else {
      updateProvisioningStage(state, "RUNTIME", "Starting NemoClaw non-interactive onboarding.");
      const command = onboardCommand(input);
      const result = await runCommand("nemoclaw", command.args, command.env);
      state.logs.push(...result.stdout.split("\n").filter(Boolean).slice(-100));
      if (result.exitCode !== 0)
        throw new Error(
          result.stderr.trim() || `nemoclaw exited ${result.exitCode}`,
        );
      await installAgentInstructions(input);
      state.logs.push(
        "Agent instructions installed in the OpenClaw workspace.",
      );
    }
    states.set(input.name, {
      ...state,
      phase: "READY",
      provisioningStage: "READY",
      operationId,
      ...(httpEndpoint ? { httpEndpoint } : {}),
    });
  } catch (error) {
    states.set(input.name, {
      ...state,
      phase: "FAILED",
      operationId,
      error: error instanceof Error ? error.message : "Provisioning failed.",
    });
  } finally {
    activeProvisions.delete(input.name);
  }
}

app.use(express.json({ limit: "32kb" }));
app.get("/health", (_request, response) => response.json({ ok: true, mode }));
app.use((request, response, next) =>
  authorized(request.headers.authorization)
    ? next()
    : response.status(401).json({ error: "Unauthorized." }),
);

app.post("/v1/sandboxes", (request, response, next) => {
  try {
    const parsedInput = createSchema.parse(request.body);
    const input: ProvisionInput = {
      name: parsedInput.name,
      provider: parsedInput.provider,
      model: parsedInput.model,
      systemPrompt: parsedInput.systemPrompt,
      policyYaml: parsedInput.policyYaml,
      ...(parsedInput.apiKey ? { apiKey: parsedInput.apiKey } : {}),
    };
    if (states.has(input.name))
      return void response
        .status(409)
        .json({ error: "Sandbox already exists." });
    const operationId = crypto.randomUUID();
    const state: SandboxState = {
      name: input.name,
      phase: "PROVISIONING",
      provisioningStage: "QUEUED",
      operationId,
      logs: ["NemoClaw provisioning queued."],
    };
    states.set(input.name, state);
    void provision(input, operationId);
    response.status(202).json(responseState(state));
  } catch (error) {
    next(error);
  }
});

app.get("/v1/sandboxes/:name", async (request, response, next) => {
  try {
    const name = z.string().parse(request.params.name);
    const local = states.get(name);
    if (
      local?.phase === "FAILED" ||
      mode === "fixture" ||
      activeProvisions.has(name)
    )
      return void response.json(
        local ?? { name, phase: "NOT_FOUND", logs: [] },
      );
    if (isOpenShell) {
      const observed = await observeOpenShellSandbox(name);
      const normalized = observed?.phase.toLowerCase();
      const phase: Phase = !observed
        ? "NOT_FOUND"
        : normalized === "ready"
          ? "READY"
          : normalized === "failed" || normalized === "error"
            ? "FAILED"
            : "PROVISIONING";
      let httpEndpoint = local?.httpEndpoint;
      if (phase === "READY" && httpEndpoint?.status !== "READY") {
        try {
          httpEndpoint = {
            kind: "openclaw-webui",
            status: "READY",
            url: await ensureOpenShellWebUiEndpoint(name),
          };
        } catch (error) {
          httpEndpoint = {
            kind: "openclaw-webui",
            status: "UNAVAILABLE",
            reason:
              error instanceof Error
                ? error.message
                : "Unable to expose the OpenClaw Web UI.",
          };
        }
      }
      const next: SandboxState = {
        name,
        phase,
        ...(phase === "READY"
          ? { provisioningStage: "READY" as const }
          : local?.provisioningStage
            ? { provisioningStage: local.provisioningStage }
            : {}),
        ...(local?.operationId ? { operationId: local.operationId } : {}),
        logs: local?.logs ?? [],
        ...(httpEndpoint ? { httpEndpoint } : {}),
      };
      if (phase === "NOT_FOUND") states.delete(name);
      else states.set(name, next);
      return void response.json(next);
    }
    const result = await runCommand("nemoclaw", [
      "sandbox",
      "status",
      name,
      "--json",
    ]);
    if (result.exitCode !== 0 && !result.stdout)
      return void response.json({
        name,
        phase: "FAILED",
        logs: [],
        error: result.stderr.trim(),
      });
    const payload = JSON.parse(result.stdout) as {
      found?: boolean;
      phase?: string;
    };
    const observedPhase = payload.phase?.toLowerCase();
    const phase: Phase =
      payload.found === false
        ? "NOT_FOUND"
        : observedPhase === "ready"
          ? "READY"
          : observedPhase === "failed" || observedPhase === "error"
            ? "FAILED"
            : "PROVISIONING";
    response.json({ name, phase, logs: local?.logs ?? [] });
  } catch (error) {
    next(error);
  }
});

app.get("/v1/sandboxes/:name/audit", async (request, response, next) => {
  try {
    const name = z.string().parse(request.params.name);
    if (!isOpenShell) return void response.json({ data: [] });
    response.json({ data: await getOpenShellAuditEvents(name) });
  } catch (error) {
    next(error);
  }
});

app.delete("/v1/sandboxes/:name", async (request, response, next) => {
  try {
    const name = z.string().parse(request.params.name);
    const current = states.get(name) ?? {
      name,
      phase: "DESTROYING" as const,
      logs: [],
    };
    states.set(name, { ...current, phase: "DESTROYING" });
    if (isOpenShell) {
      await deleteOpenShellWebUiEndpoint(name);
      await deleteOpenShellSandbox(name);
    } else if (mode !== "fixture") {
      const result = await runCommand("nemoclaw", [name, "destroy", "--yes"]);
      if (result.exitCode !== 0)
        throw new Error(result.stderr.trim() || "NemoClaw destroy failed.");
    }
    states.delete(name);
    response.status(202).json({
      name,
      phase: "NOT_FOUND",
      logs: [...current.logs, "Sandbox destroyed."],
    });
  } catch (error) {
    next(error);
  }
});

server.on("upgrade", async (request, socket, head) => {
  if (!authorized(request.headers.authorization))
    return void rejectTerminalUpgrade(socket, 401, "Unauthorized.");
  const url = new URL(
    request.url ?? "/",
    `http://${request.headers.host ?? "localhost"}`,
  );
  const match = url.pathname.match(/^\/v1\/sandboxes\/([a-z0-9-]+)\/terminal$/);
  if (!match)
    return void rejectTerminalUpgrade(socket, 409, "Unknown terminal path.");
  const sandboxName = match[1] ?? "";
  let state: SandboxState | undefined;
  try {
    state = await readySandboxState(sandboxName);
  } catch (error) {
    console.error(
      `[terminal ${sandboxName}] unable to recover sandbox state: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
  if (!state)
    return void rejectTerminalUpgrade(
      socket,
      409,
      "NemoClaw sandbox is not ready for terminal access.",
    );
  if (mode === "fixture")
    return void rejectTerminalUpgrade(
      socket,
      409,
      "Fixture mode cannot launch the NemoClaw TUI and never exposes a host shell.",
    );
  if (socket.destroyed) return;
  sockets.handleUpgrade(request, socket, head, (webSocket) => {
    const connectionId = crypto.randomUUID().slice(0, 8);
    console.info(
      `[terminal ${connectionId}] allocating terminal for ${state.name}`,
    );
    try {
      const terminal = pty.spawn(
        isOpenShell ? openShellBinary() : "nemoclaw",
        isOpenShell
          ? openShellTerminalArguments(state.name)
          : nemoClawTerminalArguments(state.name),
        {
          name: "xterm-256color",
          cols: 100,
          rows: 30,
          cwd: process.cwd(),
          env: Object.fromEntries(
            Object.entries(process.env).filter(
              (entry): entry is [string, string] =>
                typeof entry[1] === "string",
            ),
          ),
        },
      );
      console.info(
        `[terminal ${connectionId}] PTY allocated for ${state.name}`,
      );
      let receivedOutput = false;
      terminal.onData((data) => {
        if (!receivedOutput) {
          receivedOutput = true;
          console.info(`[terminal ${connectionId}] OpenClaw TUI produced output`);
        }
        if (webSocket.readyState === WebSocket.OPEN) webSocket.send(data);
      });
      webSocket.send(
        `Connected to NemoClaw runtime ${state.name}\r\n` +
          "Opening the OpenClaw TUI through the in-sandbox Gateway…\r\n",
      );
      terminal.onExit(({ exitCode }) => {
        console.info(
          `[terminal ${connectionId}] PTY exited with code ${exitCode}`,
        );
        if (webSocket.readyState === WebSocket.OPEN)
          webSocket.close(1000, `Terminal exited ${exitCode}`);
      });
      webSocket.on("message", (raw) => {
        const input = raw.toString();
        const resize = parseTerminalResize(input);
        if (resize) terminal.resize(resize.cols, resize.rows);
        else terminal.write(input);
      });
      webSocket.on("close", () => {
        console.info(`[terminal ${connectionId}] browser disconnected`);
        try {
          terminal.kill();
        } catch {
          // The PTY may already have exited on its own.
        }
      });
      webSocket.on("error", (error) =>
        console.error(
          `[terminal ${connectionId}] browser WebSocket error: ${error.message}`,
        ),
      );
    } catch (error) {
      webSocket.send(
        `Unable to allocate Agent terminal: ${error instanceof Error ? error.message : "unknown error"}\r\n`,
      );
      webSocket.close(1011, "Terminal allocation failed");
    }
  });
});

app.use(
  (
    error: unknown,
    _request: express.Request,
    response: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(error);
    if (error instanceof z.ZodError)
      return void response
        .status(400)
        .json({ error: error.issues[0]?.message ?? "Invalid request." });
    response.status(500).json({
      error:
        error instanceof Error ? error.message : "Unexpected runner error.",
    });
  },
);

server.listen(port, host, () =>
  console.log(`TaskLattice Runtime Runner listening on ${host}:${port} (${mode})`),
);
