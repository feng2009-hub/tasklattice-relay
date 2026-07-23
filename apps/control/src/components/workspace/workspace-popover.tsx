import { Settings2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { WorkspaceItem } from "@/components/workspace/workspace-item";
import type { Workspace } from "@/types/workspace";

export function WorkspacePopover({
  currentWorkspace,
  onManage,
  onSelect,
  workspaces,
}: {
  currentWorkspace: Workspace;
  onManage: () => void;
  onSelect: (workspace: Workspace) => void;
  workspaces: Workspace[];
}) {
  return (
    <div className="w-[280px]">
      <div className="px-3 pb-1 pt-3 text-xs font-semibold text-muted-foreground">
        Switch workspace
      </div>
      <div className="space-y-0.5 p-1.5">
        {workspaces.map((workspace) => (
          <WorkspaceItem
            key={workspace.id}
            current={workspace.id === currentWorkspace.id}
            onSelect={onSelect}
            workspace={workspace}
          />
        ))}
      </div>
      <div className="border-t p-1.5">
        <Link
          to="/settings/workspaces"
          search={{ workspace: currentWorkspace.id }}
          onClick={onManage}
          className="flex min-h-11 items-center gap-2 rounded-md px-2.5 text-sm font-medium outline-none transition-colors hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring/35"
        >
          <Settings2 className="size-4 text-muted-foreground" />
          Manage workspaces
        </Link>
      </div>
    </div>
  );
}
