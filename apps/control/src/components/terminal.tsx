import { useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as Xterm } from "@xterm/xterm";
import {
  encodeTerminalResize,
  type AgentPlatformId,
  type RuntimeStatus,
} from "@tasklattice/contracts";
import "@xterm/xterm/css/xterm.css";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  acquireTerminalSession,
  releaseTerminalSession,
  resetTerminalSession,
  type TerminalSession,
  type TerminalSessionEvent,
} from "@/lib/terminal-session";
import { getAgentPlatformPresentation } from "@/lib/agent-platforms";
import { cn } from "@/lib/utils";

export type TerminalConnectionState =
  | "idle"
  | "connecting"
  | "starting"
  | "ready"
  | "closed"
  | "error";

export function AgentTerminal({
  agentId,
  agentPlatform,
  enabled,
  fill = false,
  onRecheckRuntime,
  runtimeChecking,
  runtimeError,
  runtimeStatus,
}: {
  agentId: string;
  agentPlatform: AgentPlatformId;
  enabled: boolean;
  fill?: boolean;
  onRecheckRuntime: () => void;
  runtimeChecking: boolean;
  runtimeError?: string | undefined;
  runtimeStatus?: RuntimeStatus | undefined;
}) {
  const platform = getAgentPlatformPresentation(agentPlatform);
  const container = useRef<HTMLDivElement>(null);
  const [connectionState, setConnectionState] =
    useState<TerminalConnectionState>("idle");
  const [attempt, setAttempt] = useState(0);
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (enabled && runtimeStatus?.terminal.available) setRequested(true);
  }, [enabled, runtimeStatus?.terminal.available]);

  useEffect(() => {
    if (!requested || !container.current) return;

    const terminal = new Xterm({
      convertEol: true,
      cursorBlink: true,
      cursorStyle: "block",
      fontSize: 13,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      scrollback: 2_000,
      theme: {
        background: "#0b0f0e",
        foreground: "#d8e0db",
        cursor: "#b9f45a",
        selectionBackground: "#36531499",
      },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(container.current);
    terminal.writeln(
      `\x1b[2mOpening ${platform.terminalLabel} for this Agent…\x1b[0m`,
    );
    terminal.writeln(
      "\x1b[2mDetecting the Sandbox runtime before opening its terminal…\x1b[0m",
    );
    setConnectionState("connecting");

    let disposed = false;
    let session: TerminalSession | undefined;
    let sessionListener: ((event: TerminalSessionEvent) => void) | undefined;
    let runtimeTimer: number | undefined;
    const sessionKey = `agent/${agentId}`;
    const connectionTimer = window.setTimeout(() => {
      if (disposed || session?.connected) return;
      const message =
        `${platform.terminalLabel} connection timed out. Reconnect the console or inspect Sandbox activity.`;
      setError(message);
      setConnectionState("error");
      terminal.writeln(`\r\n\x1b[31m${message}\x1b[0m`);
      if (
        session?.socket.readyState === WebSocket.OPEN ||
        session?.socket.readyState === WebSocket.CONNECTING
      )
        session.socket.close(4000, "terminal connection timed out");
    }, 15_000);
    const clearTimers = () => {
      window.clearTimeout(connectionTimer);
      if (runtimeTimer) window.clearTimeout(runtimeTimer);
    };
    const markReady = () => {
      clearTimers();
      setConnectionState("ready");
    };

    const markRuntimeConnected = () => {
      window.clearTimeout(connectionTimer);
      setConnectionState("starting");
      if (runtimeTimer) return;
      runtimeTimer = window.setTimeout(() => {
        if (disposed || session?.interactive) return;
        const message =
          `NemoClaw connected, but ${platform.terminalLabel} did not produce a frame. Reconnect the console or inspect Sandbox activity.`;
        setError(message);
        setConnectionState("error");
        terminal.writeln(`\r\n\x1b[31m${message}\x1b[0m`);
        if (
          session?.socket.readyState === WebSocket.OPEN ||
          session?.socket.readyState === WebSocket.CONNECTING
        )
          session.socket.close(4000, `${platform.name} TUI frame timed out`);
      }, 20_000);
    };

    const sendResize = () => {
      fit.fit();
      if (session?.socket.readyState === WebSocket.OPEN)
        session.socket.send(
          encodeTerminalResize({ cols: terminal.cols, rows: terminal.rows }),
        );
    };

    const resizeObserver = new ResizeObserver(() => sendResize());
    resizeObserver.observe(container.current);
    requestAnimationFrame(() => sendResize());

    const inputSubscription = terminal.onData((data) => {
      if (session?.socket.readyState === WebSocket.OPEN)
        session.socket.send(data);
    });

    const focusTerminal = () => terminal.focus();
    container.current.addEventListener("pointerdown", focusTerminal);

    void acquireTerminalSession(sessionKey, async () => {
      const created = await api.createTerminalSession(agentId);
      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      return `${protocol}//${location.host}${created.websocketUrl}`;
    })
      .then((acquired) => {
        session = acquired;
        if (disposed) {
          releaseTerminalSession(sessionKey);
          return;
        }
        sessionListener = (event) => {
          if (disposed) return;
          if (event.type === "open") {
            terminal.writeln(
              `\x1b[2mSession connected; launching ${platform.terminalLabel} inside the Sandbox…\x1b[0m`,
            );
            sendResize();
            terminal.focus();
            return;
          }
          if (event.type === "message") {
            if (event.data.startsWith("Connected to NemoClaw runtime ")) {
              markRuntimeConnected();
            } else if (session?.interactive) {
              markReady();
            }
            terminal.write(event.data);
            terminal.focus();
            return;
          }
          if (event.type === "close") {
            clearTimers();
            setConnectionState("closed");
            const suffix = event.event.reason ? `: ${event.event.reason}` : "";
            terminal.writeln(
              `\r\n\x1b[2mTerminal session closed${suffix}.\x1b[0m`,
            );
            return;
          }
          if (event.type === "error") {
            clearTimers();
            setError("Unable to connect to the Sandbox terminal.");
            setConnectionState("error");
          }
        };
        session.listeners.add(sessionListener);
        if (session.buffer.length > 0) terminal.write(session.buffer.join(""));
        if (session.connected) {
          if (session.interactive) markReady();
          else markRuntimeConnected();
          sendResize();
          terminal.focus();
        }
      })
      .catch((reason: unknown) => {
        clearTimers();
        const message =
          reason instanceof Error ? reason.message : "Terminal unavailable.";
        setError(message);
        setConnectionState("error");
        terminal.writeln(`\r\n\x1b[31m${message}\x1b[0m`);
      });

    return () => {
      disposed = true;
      clearTimers();
      resizeObserver.disconnect();
      container.current?.removeEventListener("pointerdown", focusTerminal);
      if (session && sessionListener) session.listeners.delete(sessionListener);
      releaseTerminalSession(sessionKey);
      inputSubscription.dispose();
      terminal.dispose();
    };
  }, [agentId, attempt, platform.name, platform.terminalLabel, requested]);

  const retry = () => {
    resetTerminalSession(`agent/${agentId}`);
    setError(undefined);
    setConnectionState("connecting");
    setAttempt((value) => value + 1);
  };

  if (runtimeError || (runtimeStatus && !runtimeStatus.terminal.available)) {
    return (
      <div className={cn("grid min-h-[300px] place-items-center bg-[#0b0f0e] p-6 text-center text-white", fill && "h-full min-h-0")}>
        <div className="max-w-xl">
          <AlertTriangle className="mx-auto size-5 text-amber-600" />
          <p className="mt-3 text-sm font-medium">Console unavailable</p>
          <p className="mt-2 text-sm leading-6 text-white/60">
            {runtimeError ?? runtimeStatus?.terminal.reason}
          </p>
          <Button
            className="mt-5 border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
            disabled={runtimeChecking}
            variant="outline"
            onClick={onRecheckRuntime}
          >
            <RefreshCw className={runtimeChecking ? "animate-spin" : undefined} />
            {runtimeChecking ? "Checking runtime…" : "Recheck runtime"}
          </Button>
        </div>
      </div>
    );
  }

  if (!runtimeStatus || !enabled || !requested)
    return (
      <div className={cn("grid min-h-[300px] place-items-center bg-[#0b0f0e] px-6 text-center text-white", fill && "h-full min-h-0")}>
        <div>
          <Spinner className="mx-auto size-5 text-white/60" />
          <p className="mt-3 text-sm font-medium">
            {!runtimeStatus
              ? "Checking OpenShell runtime…"
              : !enabled
                ? "Waiting for the Sandbox to become ready…"
                : "Preparing console…"}
          </p>
        </div>
      </div>
    );

  const ready = connectionState === "ready";
  const status = ready
    ? "Console ready — connected through NemoClaw"
    : connectionState === "starting"
      ? "NemoClaw connected — waiting for console output…"
      : connectionState === "closed"
        ? "Terminal session closed"
        : (error ?? "Connecting to the OpenShell Sandbox…");

  return (
    <div className={cn("flex min-h-0 flex-col", fill && "h-full")}>
      <div className="mb-2 flex min-h-11 flex-wrap items-center justify-between gap-2 text-xs text-white/60">
        <span className="flex items-center gap-2">
          <span
            className={`size-2 rounded-full ${
              ready
                ? "bg-emerald-500"
                : connectionState === "error" || connectionState === "closed"
                  ? "bg-red-500"
                  : "animate-pulse bg-amber-500"
            }`}
          />
          {status}
        </span>
        {connectionState === "error" || connectionState === "closed" ? (
          <Button className="h-11 border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white" size="sm" variant="outline" onClick={retry}>
            Reconnect
          </Button>
        ) : null}
      </div>
      <div
        ref={container}
        aria-label={`Interactive ${platform.name} console in OpenShell`}
        className={cn(
          "cursor-text overflow-hidden rounded-sm border bg-[#0b0f0e] p-2",
          fill ? "min-h-0 flex-1" : "h-[min(58vh,560px)] min-h-[420px]",
        )}
      />
    </div>
  );
}
