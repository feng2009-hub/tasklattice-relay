import { Settings2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { KeyboardEvent } from "react";
import { WorkspaceItem } from "@/components/workspace/workspace-item";
import type { Workspace } from "@/types/workspace";

export function WorkspacePopover({
  currentWorkspace,
  error,
  isSwitching,
  onManage,
  onSelect,
  switchingWorkspaceId,
  workspaces,
}: {
  currentWorkspace: Workspace;
  error?: string;
  isSwitching?: boolean;
  onManage: () => void;
  onSelect: (workspace: Workspace) => void | Promise<void>;
  switchingWorkspaceId?: string | null;
  workspaces: Workspace[];
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>("[data-workspace-menu-item]"),
    );
    if (!items.length) return;
    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : event.key === "ArrowDown"
            ? (currentIndex + 1 + items.length) % items.length
            : (currentIndex - 1 + items.length) % items.length;
    items[nextIndex]?.focus();
  };

  return (
    <div className="w-[280px]" onKeyDown={handleKeyDown}>
      <div id="workspace-switcher-title" className="px-3 pb-1 pt-3 text-xs font-semibold text-muted-foreground">
        Switch workspace
      </div>
      <div
        aria-labelledby="workspace-switcher-title"
        className="max-h-80 space-y-0.5 overflow-y-auto p-1.5"
        role="menu"
      >
        {workspaces.map((workspace, index) => (
          <WorkspaceItem
            key={workspace.id}
            current={workspace.id === currentWorkspace.id}
            isSwitching={switchingWorkspaceId === workspace.id}
            onSelect={onSelect}
            tabIndex={workspace.id === currentWorkspace.id || (!workspaces.some((item) => item.id === currentWorkspace.id) && index === 0) ? 0 : -1}
            workspace={workspace}
          />
        ))}
      </div>
      {error ? (
        <p className="border-t border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="border-t p-1.5">
        <Link
          to="/settings/workspaces"
          search={{ workspace: currentWorkspace.id }}
          onClick={onManage}
          aria-disabled={isSwitching}
          className="flex min-h-11 items-center gap-2 rounded-md px-2.5 text-sm font-medium outline-none transition-colors hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring/35 aria-disabled:pointer-events-none aria-disabled:opacity-50"
          data-workspace-menu-item
          role="menuitem"
          tabIndex={-1}
        >
          <Settings2 className="size-4 text-muted-foreground" />
          Manage workspaces
        </Link>
      </div>
    </div>
  );
}
