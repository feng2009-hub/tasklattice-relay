import { useState } from "react";
import { Check, ChevronsUpDown, LoaderCircle } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { WorkspaceAvatar } from "@/components/workspace/workspace-item";
import { WorkspacePopover } from "@/components/workspace/workspace-popover";
import { useSwitchWorkspace } from "@/hooks/use-switch-workspace";
import { useWorkspace } from "@/hooks/use-workspace";

export function WorkspaceSwitcher() {
  const [open, setOpen] = useState(false);
  const { availableWorkspaces, currentWorkspace } = useWorkspace();
  const { loading, switchWorkspace } = useSwitchWorkspace();

  if (!currentWorkspace) {
    return (
      <div
        className="h-11 w-40 animate-pulse rounded-md bg-muted"
        aria-label="Loading workspace"
      />
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-11 min-w-0 max-w-56 items-center gap-2 rounded-md border border-transparent px-2 text-left outline-none transition-colors hover:border-border hover:bg-muted/55 focus-visible:ring-2 focus-visible:ring-ring/35 aria-expanded:border-border aria-expanded:bg-muted/55"
          aria-label={`Current workspace: ${currentWorkspace.name}. Switch workspace`}
          disabled={loading}
        >
          <WorkspaceAvatar className="size-7" workspace={currentWorkspace} />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">
            {currentWorkspace.name}
          </span>
          {loading ? (
            <LoaderCircle className="size-4 shrink-0 animate-spin text-muted-foreground" />
          ) : open ? (
            <Check className="size-4 shrink-0 text-primary" />
          ) : (
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
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
          onManage={() => setOpen(false)}
          onSelect={(workspace) => {
            setOpen(false);
            void switchWorkspace(workspace.id);
          }}
          workspaces={availableWorkspaces}
        />
      </PopoverContent>
    </Popover>
  );
}
