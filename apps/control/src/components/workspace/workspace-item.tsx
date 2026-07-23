import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Workspace } from "@/types/workspace";

const avatarTones = [
  "bg-violet-100 text-violet-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-800",
  "bg-sky-100 text-sky-700",
  "bg-rose-100 text-rose-700",
];

function workspaceInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "W";
}

function toneForWorkspace(workspaceId: string): string {
  const value = Array.from(workspaceId).reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );
  return avatarTones[value % avatarTones.length] ?? avatarTones[0]!;
}

export function WorkspaceAvatar({
  className,
  workspace,
}: {
  className?: string;
  workspace: Workspace;
}) {
  return (
    <Avatar className={cn("size-8", className)}>
      {workspace.avatar ? (
        <AvatarImage alt="" src={workspace.avatar} />
      ) : null}
      <AvatarFallback
        className={cn(
          "text-xs font-semibold",
          toneForWorkspace(workspace.id),
        )}
      >
        {workspaceInitial(workspace.name)}
      </AvatarFallback>
    </Avatar>
  );
}

export function WorkspaceItem({
  current = false,
  isSwitching = false,
  onSelect,
  tabIndex,
  workspace,
}: {
  current?: boolean;
  isSwitching?: boolean;
  onSelect: (workspace: Workspace) => void | Promise<void>;
  tabIndex?: number;
  workspace: Workspace;
}) {
  const detail =
    workspace.type === "personal"
      ? "Personal workspace"
      : `${workspace.memberCount} ${workspace.memberCount === 1 ? "member" : "members"}`;

  return (
    <button
      type="button"
      className={cn(
        "flex min-h-14 w-full items-center gap-3 rounded-md px-2.5 py-2 text-left outline-none transition-colors hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring/35",
        current && "bg-primary/[0.07] hover:bg-primary/[0.1]",
        isSwitching && "cursor-wait",
      )}
      onClick={() => {
        if (!current && !isSwitching) void onSelect(workspace);
      }}
      aria-checked={current}
      aria-current={current ? "true" : undefined}
      aria-disabled={current || isSwitching}
      data-workspace-menu-item
      role="menuitemradio"
      tabIndex={tabIndex}
    >
      <WorkspaceAvatar workspace={workspace} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {workspace.name}
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {detail}
        </span>
      </span>
      {isSwitching ? (
        <LoaderCircle className="size-4 shrink-0 animate-spin text-muted-foreground" />
      ) : current ? (
        <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
          Current
        </span>
      ) : null}
    </button>
  );
}
