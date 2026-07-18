import { useEffect, useRef, useState } from "react";
import type { AgentPlatformId, RuntimeStatus } from "@tasklattice/contracts";
import { Maximize2, Minimize2 } from "lucide-react";
import { AgentTerminal } from "@/components/terminal";
import { Button } from "@/components/ui/button";
import { getAgentPlatformPresentation } from "@/lib/agent-platforms";
import { cn } from "@/lib/utils";

export function AgentTerminalWorkspace({
  agentId,
  agentPlatform,
  onRecheckRuntime,
  runtimeChecking,
  runtimeError,
  runtimeStatus,
}: {
  agentId: string;
  agentPlatform: AgentPlatformId;
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
      aria-label={`${platform.name} console`}
      className={cn(
        "flex scroll-mt-24 flex-col overflow-hidden border bg-[#0b0f0e]",
        fullScreen
          ? "fixed inset-0 z-[90] h-dvh w-screen"
          : "h-[min(68vh,680px)] min-h-[480px]",
      )}
    >
      <div role="toolbar" aria-label="Console controls" className="flex min-h-12 shrink-0 items-center justify-end gap-3 border-b bg-background px-2 text-foreground">
        <div className="flex items-center gap-3">
          {fullScreen ? (
            <span className="hidden text-[11px] text-muted-foreground sm:inline">
              Esc to exit full screen
            </span>
          ) : null}
          <Button
            ref={expandButton}
            type="button"
            variant="outline"
            size="sm"
            aria-label={fullScreen ? "Exit full-screen console" : "Open full-screen console"}
            onClick={() => setFullScreen((current) => !current)}
            className="h-9"
          >
            {fullScreen ? <Minimize2 /> : <Maximize2 />}
            <span className="hidden sm:inline">
              {fullScreen ? "Exit full screen" : "Full screen"}
            </span>
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 p-3">
        <AgentTerminal
          agentId={agentId}
          agentPlatform={agentPlatform}
          enabled
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
