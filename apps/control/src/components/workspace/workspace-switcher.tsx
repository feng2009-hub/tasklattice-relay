import { useState } from "react";
import { ChevronDown, LoaderCircle } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { WorkspacePopover } from "@/components/workspace/workspace-popover";
import { useSwitchWorkspace } from "@/hooks/use-switch-workspace";
import { useWorkspace } from "@/hooks/use-workspace";

export function WorkspaceSwitcher() {
  const [open, setOpen] = useState(false);
  const [switchError, setSwitchError] = useState("");
  const { availableWorkspaces, currentWorkspace, loading } = useWorkspace();
  const { isSwitching, switchingWorkspaceId, switchWorkspace } = useSwitchWorkspace();

  if (loading && !currentWorkspace) {
    return (
      <div
        className="h-8 w-28 animate-pulse rounded-sm bg-muted/70"
        aria-label="Loading workspace"
      />
    );
  }

  if (!currentWorkspace) {
    return (
      <button
        type="button"
        className="h-8 min-w-0 max-w-44 truncate rounded-sm px-1.5 text-xs font-semibold text-muted-foreground"
        disabled
      >
        No workspace available
      </button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-8 min-w-0 max-w-[min(12rem,38vw)] items-center gap-1 rounded-sm px-1.5 text-left outline-none transition-colors hover:bg-muted/55 focus-visible:ring-2 focus-visible:ring-ring/35 disabled:cursor-wait disabled:opacity-75"
          aria-label={`Current workspace: ${currentWorkspace.name}. Switch workspace`}
          aria-expanded={open}
          aria-haspopup="menu"
          disabled={isSwitching}
          title={currentWorkspace.name}
        >
          <span className="min-w-0 truncate font-semibold">
            {currentWorkspace.name}
          </span>
          {isSwitching ? (
            <LoaderCircle className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <ChevronDown
              className="size-3.5 shrink-0 text-muted-foreground transition-transform data-[open=true]:rotate-180"
              data-open={open}
            />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto overflow-hidden p-0 shadow-lg"
        sideOffset={6}
      >
        <WorkspacePopover
          currentWorkspace={currentWorkspace}
          error={switchError}
          isSwitching={isSwitching}
          onManage={() => setOpen(false)}
          onSelect={async (workspace) => {
            if (workspace.id === currentWorkspace.id || isSwitching) return;
            setSwitchError("");
            try {
              await switchWorkspace(workspace.id);
              setOpen(false);
            } catch (reason) {
              setSwitchError(
                reason instanceof Error
                  ? reason.message
                  : "Unable to switch workspaces.",
              );
            }
          }}
          switchingWorkspaceId={switchingWorkspaceId}
          workspaces={availableWorkspaces}
        />
      </PopoverContent>
    </Popover>
  );
}
