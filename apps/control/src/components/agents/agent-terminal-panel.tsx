import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentPlatformId, TerminalTarget } from "@tali/contracts";
import {
  Maximize2,
  Minimize2,
  RefreshCw,
  SquareTerminal,
} from "lucide-react";
import {
  AgentTerminal,
  type TerminalConnectionSnapshot,
} from "@/components/terminal";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getAgentPlatformPresentation } from "@/lib/agent-platforms";
import { cn } from "@/lib/utils";

const statusLabels: Record<TerminalConnectionSnapshot["state"], string> = {
  connecting: "Connecting…",
  connected: "Connected",
  closed: "Connection closed",
  error: "Connection failed",
};

function targetLabel(target: TerminalTarget): string {
  return target.displayName ?? target.containerName;
}

function ConnectionStatus({
  connection,
}: {
  connection: TerminalConnectionSnapshot;
}) {
  return (
    <div
      role="status"
      title={connection.message}
      className="flex min-w-0 items-center gap-2 text-[11px] text-zinc-400"
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          connection.state === "connected" &&
            "bg-emerald-400 shadow-[0_0_0_3px_rgb(52_211_153/0.1)]",
          connection.state === "connecting" &&
            "animate-pulse bg-amber-400",
          (connection.state === "closed" || connection.state === "error") &&
            "bg-red-400",
        )}
      />
      <span className="truncate">
        {connection.message ?? statusLabels[connection.state]}
      </span>
    </div>
  );
}

export function AgentTerminalPanel({
  agentId,
  agentPlatform,
  targets,
}: {
  agentId: string;
  agentPlatform: AgentPlatformId;
  targets: TerminalTarget[];
}) {
  const primaryTarget = useMemo(
    () =>
      targets.find((target) => target.primary && target.available) ??
      targets.find((target) => target.available),
    [targets],
  );
  const [selectedTargetId, setSelectedTargetId] = useState(
    primaryTarget?.id ?? "",
  );
  const [fullScreen, setFullScreen] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [connection, setConnection] = useState<TerminalConnectionSnapshot>({
    state: "connecting",
  });
  const panel = useRef<HTMLElement>(null);
  const expandButton = useRef<HTMLButtonElement>(null);
  const platform = getAgentPlatformPresentation(agentPlatform);
  const selectedTarget =
    targets.find(
      (target) => target.id === selectedTargetId && target.available,
    ) ?? primaryTarget;

  useEffect(() => {
    if (
      primaryTarget &&
      !targets.some(
        (target) => target.id === selectedTargetId && target.available,
      )
    )
      setSelectedTargetId(primaryTarget.id);
  }, [primaryTarget, selectedTargetId, targets]);

  useEffect(() => {
    let wasFullScreen = false;
    const handleFullScreenChange = () => {
      const isFullScreen = document.fullscreenElement === panel.current;
      setFullScreen(isFullScreen);
      if (wasFullScreen && !isFullScreen)
        window.requestAnimationFrame(() => expandButton.current?.focus());
      wasFullScreen = isFullScreen;
    };

    document.addEventListener("fullscreenchange", handleFullScreenChange);
    return () => {
      document.removeEventListener(
        "fullscreenchange",
        handleFullScreenChange,
      );
    };
  }, []);

  if (!selectedTarget) return null;

  const reconnect = () => {
    setConnection({ state: "connecting" });
    setReconnectAttempt((attempt) => attempt + 1);
  };
  const toggleFullScreen = async () => {
    if (document.fullscreenElement === panel.current)
      await document.exitFullscreen();
    else await panel.current?.requestFullscreen();
  };

  return (
    <section
      ref={panel}
      id="terminal"
      aria-label={`${platform.name} terminal`}
      className={cn(
        "flex scroll-mt-24 flex-col overflow-hidden bg-[#0b0f0e] shadow-[0_1px_2px_rgb(0_0_0/0.12),0_12px_32px_rgb(0_0_0/0.08)]",
        fullScreen
          ? "h-dvh w-dvw"
          : "h-[calc(100dvh-18rem)] min-h-[520px] max-h-[760px] rounded-lg border border-zinc-800/80",
      )}
    >
      <div
        role="toolbar"
        aria-label="Terminal controls"
        className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-white/[0.07] bg-[#121715] px-3 py-1.5 text-zinc-100 sm:px-4"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <SquareTerminal
            aria-hidden="true"
            className="size-4 shrink-0 text-zinc-500"
          />
          {targets.length > 1 ? (
            <Select
              value={selectedTarget.id}
              onValueChange={(targetId) => {
                const nextTarget = targets.find(
                  (target) => target.id === targetId && target.available,
                );
                if (!nextTarget) return;
                setConnection({ state: "connecting" });
                setReconnectAttempt(0);
                setSelectedTargetId(nextTarget.id);
              }}
            >
              <SelectTrigger
                aria-label="Select terminal container"
                className="h-9 min-w-40 border-white/10 bg-white/[0.04] text-zinc-200 shadow-none hover:bg-white/[0.07]"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {targets.map((target) => (
                  <SelectItem
                    key={target.id}
                    value={target.id}
                    disabled={!target.available}
                  >
                    {targetLabel(target)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <strong className="truncate text-[13px] font-medium text-zinc-200">
              {targetLabel(selectedTarget)}
            </strong>
          )}
        </div>

        <span
          aria-hidden="true"
          className="hidden h-3 w-px bg-white/10 sm:block"
        />
        <ConnectionStatus connection={connection} />

        <div className="ml-auto flex items-center gap-2">
          {connection.state === "closed" || connection.state === "error" ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-11 text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100 sm:h-9"
              onClick={reconnect}
            >
              <RefreshCw /> Reconnect
            </Button>
          ) : null}
          <Button
            ref={expandButton}
            type="button"
            variant="ghost"
            size="sm"
            className="h-11 min-w-11 text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100 sm:h-9"
            aria-label={
              fullScreen
                ? "Exit full-screen terminal"
                : "Open full-screen terminal"
            }
            onClick={() => void toggleFullScreen()}
          >
            {fullScreen ? <Minimize2 /> : <Maximize2 />}
            <span className="hidden sm:inline">
              {fullScreen ? "Exit full screen" : "Full screen"}
            </span>
          </Button>
        </div>
      </div>

      <AgentTerminal
        agentId={agentId}
        agentPlatform={agentPlatform}
        reconnectAttempt={reconnectAttempt}
        targetId={selectedTarget.id}
        targetLabel={targetLabel(selectedTarget)}
        onConnectionChange={setConnection}
      />
    </section>
  );
}
