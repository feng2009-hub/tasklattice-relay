import { useEffect, useRef } from "react";
import { encodeTerminalResize, type AgentPlatformId } from "@tali/contracts";
import { FitAddon, init, Terminal } from "ghostty-web";
import { api } from "@/lib/api";
import {
  acquireTerminalSession,
  releaseTerminalSession,
  resetTerminalSession,
  type TerminalSession,
  type TerminalSessionEvent,
} from "@/lib/terminal-session";
import { getAgentPlatformPresentation } from "@/lib/agent-platforms";

let ghosttyInitialization: Promise<void> | undefined;

function initializeGhostty(): Promise<void> {
  ghosttyInitialization ??= init().catch((error: unknown) => {
    ghosttyInitialization = undefined;
    throw error;
  });
  return ghosttyInitialization;
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "Terminal unavailable.";
}

export type TerminalConnectionState =
  "connecting" | "connected" | "closed" | "error";

export interface TerminalConnectionSnapshot {
  state: TerminalConnectionState;
  message?: string;
}

export function AgentTerminal({
  agentId,
  agentPlatform,
  reconnectAttempt,
  targetId,
  targetLabel,
  onConnectionChange,
}: {
  agentId: string;
  agentPlatform: AgentPlatformId;
  reconnectAttempt: number;
  targetId: string;
  targetLabel: string;
  onConnectionChange: (snapshot: TerminalConnectionSnapshot) => void;
}) {
  const platform = getAgentPlatformPresentation(agentPlatform);
  const container = useRef<HTMLDivElement>(null);
  const connectionChange = useRef(onConnectionChange);

  useEffect(() => {
    connectionChange.current = onConnectionChange;
  }, [onConnectionChange]);

  useEffect(() => {
    const host = container.current;
    if (!host) return;
    const sessionKey = `agent/${agentId}/${targetId}`;
    if (reconnectAttempt > 0) resetTerminalSession(sessionKey);
    connectionChange.current({ state: "connecting" });

    let disposed = false;
    let terminal: Terminal | undefined;
    let session: TerminalSession | undefined;
    let sessionListener: ((event: TerminalSessionEvent) => void) | undefined;
    let inputSubscription: { dispose: () => void } | undefined;
    let resizeSubscription: { dispose: () => void } | undefined;
    let connectionTimer: number | undefined;
    let receivedOutput = false;
    let latestResize: string | undefined;
    let lastSentResize: string | undefined;

    const notify = (snapshot: TerminalConnectionSnapshot) => {
      if (!disposed) connectionChange.current(snapshot);
    };
    const clearConnectionTimer = () => {
      if (connectionTimer === undefined) return;
      window.clearTimeout(connectionTimer);
      connectionTimer = undefined;
    };
    const sendLatestResize = (force = false) => {
      if (
        !latestResize ||
        !session ||
        session.socket.readyState !== WebSocket.OPEN ||
        (!force && latestResize === lastSentResize)
      )
        return;
      session.socket.send(latestResize);
      lastSentResize = latestResize;
    };

    const start = async () => {
      try {
        await initializeGhostty();
        if (disposed) return;

        const openedTerminal = new Terminal({
          convertEol: true,
          cursorBlink: true,
          cursorStyle: "block",
          fontSize: 13,
          fontFamily:
            '"SFMono-Regular", "Cascadia Code", "Roboto Mono", "JetBrains Mono", Menlo, Monaco, Consolas, monospace',
          scrollback: 2_000,
          theme: {
            background: "#0b0f0e",
            foreground: "#d8e0db",
            cursor: "#b9f45a",
            selectionBackground: "#36531499",
          },
        });
        terminal = openedTerminal;
        const fit = new FitAddon();
        openedTerminal.loadAddon(fit);
        openedTerminal.open(host);
        host.setAttribute(
          "aria-label",
          `Interactive ${platform.name} terminal for ${targetLabel}`,
        );

        inputSubscription = openedTerminal.onData((data) => {
          if (session?.socket.readyState === WebSocket.OPEN)
            session.socket.send(data);
        });
        resizeSubscription = openedTerminal.onResize(({ cols, rows }) => {
          latestResize = encodeTerminalResize({ cols, rows });
          sendLatestResize();
        });

        fit.fit();
        latestResize = encodeTerminalResize({
          cols: openedTerminal.cols,
          rows: openedTerminal.rows,
        });
        fit.observeResize();

        connectionTimer = window.setTimeout(() => {
          if (disposed || receivedOutput) return;
          notify({ state: "error", message: "Terminal connection timed out." });
          if (
            session?.socket.readyState === WebSocket.OPEN ||
            session?.socket.readyState === WebSocket.CONNECTING
          )
            session.socket.close(4000, "terminal connection timed out");
        }, 15_000);

        session = await acquireTerminalSession(sessionKey, async () => {
          const created = await api.createTerminalSession(agentId, targetId);
          const protocol = location.protocol === "https:" ? "wss:" : "ws:";
          return `${protocol}//${location.host}${created.websocketUrl}`;
        });
        if (disposed) {
          releaseTerminalSession(sessionKey);
          return;
        }

        sessionListener = (event) => {
          if (disposed) return;
          switch (event.type) {
            case "open":
              sendLatestResize(true);
              openedTerminal.focus();
              break;
            case "message":
              if (!receivedOutput) {
                receivedOutput = true;
                clearConnectionTimer();
                notify({ state: "connected" });
              }
              openedTerminal.write(event.data);
              break;
            case "close":
              clearConnectionTimer();
              notify({
                state: "closed",
                ...(event.event.reason ? { message: event.event.reason } : {}),
              });
              break;
            case "error":
              clearConnectionTimer();
              notify({
                state: "error",
                message: "Unable to connect to the Agent terminal.",
              });
          }
        };
        session.listeners.add(sessionListener);

        if (session.buffer.length) {
          receivedOutput = true;
          clearConnectionTimer();
          notify({ state: "connected" });
          openedTerminal.write(session.buffer.join(""));
          session.buffer.length = 0;
        }
        if (session.connected) {
          sendLatestResize(true);
          openedTerminal.focus();
        }
      } catch (reason: unknown) {
        clearConnectionTimer();
        notify({ state: "error", message: errorMessage(reason) });
      }
    };

    void start();

    return () => {
      disposed = true;
      clearConnectionTimer();
      if (session && sessionListener) session.listeners.delete(sessionListener);
      releaseTerminalSession(sessionKey);
      inputSubscription?.dispose();
      resizeSubscription?.dispose();
      terminal?.dispose();
    };
  }, [agentId, agentPlatform, reconnectAttempt, targetId, targetLabel]);

  return (
    <div
      ref={container}
      aria-label={`Interactive ${platform.name} terminal for ${targetLabel}`}
      className="relative min-h-0 flex-1 cursor-text overflow-hidden bg-[#0b0f0e] p-3 outline-none before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:z-10 before:h-px before:bg-transparent before:transition-colors focus-within:before:bg-[#b9f45a]/30"
    />
  );
}
