import { useEffect, useRef, useState } from "react";
import type { AgentPlatformId, RuntimeStatus } from "@tasklattice/contracts";
import { Maximize2, Minimize2, SquareTerminal } from "lucide-react";
import { AgentTerminal } from "@/components/terminal";
import { Button } from "@/components/ui/button";
import { getAgentPlatformPresentation } from "@/lib/agent-platforms";
import { cn } from "@/lib/utils";

export function AgentTerminalWorkspace({
  agentId,
  agentName,
  agentPlatform,
  enabled,
  onRecheckRuntime,
  runtimeChecking,
  runtimeError,
  runtimeStatus,
}: {
  agentId: string;
  agentName: string;
  agentPlatform: AgentPlatformId;
  enabled: boolean;
  onRecheckRuntime: () => void;
  runtimeChecking: boolean;
  runtimeError?: string | undefined;
  runtimeStatus?: RuntimeStatus | undefined;
}) {
  const [fullScreen, setFullScreen] = useState(false);
  const expandButton = useRef<HTMLButtonElement>(null);
  const platform = getAgentPlatformPresentation(agentPlatform);

  useEffect(() => {
    if (!fullScreen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullScreen(false);
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
      window.requestAnimationFrame(() => expandButton.current?.focus());
    };
  }, [fullScreen]);

  return (
    <section
      id="terminal"
      aria-label={`${platform.terminalLabel} workspace`}
      className={cn(
        "flex scroll-mt-24 flex-col overflow-hidden border bg-[#080b0a]",
        fullScreen
          ? "fixed inset-0 z-[90] h-dvh w-screen"
          : "h-[min(72vh,720px)] min-h-[560px]",
      )}
    >
      <header className="flex min-h-16 shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-[#101513] px-4 text-white sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center border border-white/15 bg-white/5">
            <SquareTerminal className="size-4 text-[#b9f45a]" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">
              {platform.terminalLabel}
            </h2>
            <p className="truncate text-xs text-white/55">
              {agentName} · NemoClaw / {platform.name}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {fullScreen ? (
            <span className="hidden text-[11px] text-white/45 sm:inline">
              Esc to exit full screen
            </span>
          ) : null}
          <Button
            ref={expandButton}
            type="button"
            variant="outline"
            size="sm"
            aria-label={fullScreen ? "Exit full-screen TUI" : "Open full-screen TUI"}
            onClick={() => setFullScreen((current) => !current)}
            className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
          >
            {fullScreen ? <Minimize2 /> : <Maximize2 />}
            <span className="hidden sm:inline">
              {fullScreen ? "Exit full screen" : "Full screen"}
            </span>
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 p-2 sm:p-3">
        <AgentTerminal
          agentId={agentId}
          agentPlatform={agentPlatform}
          enabled={enabled}
          fill
          runtimeStatus={runtimeStatus}
          runtimeError={runtimeError}
          runtimeChecking={runtimeChecking}
          onRecheckRuntime={onRecheckRuntime}
        />
      </div>
    </section>
  );
}
