import { useEffect, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  Building2,
  Check,
  Plus,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { WorkspaceAvatar } from "@/components/workspace/workspace-item";
import { WorkspaceMembers } from "@/components/workspace/workspace-members";
import { useWorkspace } from "@/hooks/use-workspace";
import { useWorkspacePermissions } from "@/hooks/use-workspace-permissions";
import {
  createWorkspace,
  deleteWorkspace,
  renameWorkspace,
} from "@/services/workspace";
import type { Workspace } from "@/types/workspace";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings/workspaces")({
  component: WorkspacesPage,
});

function WorkspacesPage() {
  const {
    availableWorkspaces,
    currentWorkspace,
    refreshWorkspaces,
    switchWorkspace,
  } = useWorkspace();
  const permissions = useWorkspacePermissions();
  const [selectedId, setSelectedId] = useState(
    currentWorkspace?.id ?? availableWorkspaces[0]?.id,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const selectedWorkspace =
    availableWorkspaces.find((workspace) => workspace.id === selectedId) ??
    currentWorkspace ??
    availableWorkspaces[0];

  useEffect(() => {
    if (
      selectedId &&
      availableWorkspaces.some((workspace) => workspace.id === selectedId)
    ) {
      return;
    }
    setSelectedId(currentWorkspace?.id ?? availableWorkspaces[0]?.id);
  }, [availableWorkspaces, currentWorkspace?.id, selectedId]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Manage workspaces"
        description="Workspaces isolate agents, models, extensions, costs, and provider connections."
        actions={
          permissions.canCreateWorkspace ? (
            <Button className="h-11" onClick={() => setCreateOpen(true)}>
              <Plus />
              Create workspace
            </Button>
          ) : null
        }
      />

      <section className="overflow-hidden rounded-lg border bg-background">
        <div className="flex min-h-14 items-center justify-between border-b px-4">
          <div>
            <h2 className="text-sm font-semibold">Workspace list</h2>
            <p className="text-xs text-muted-foreground">
              Select a workspace to view its members and settings.
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            {availableWorkspaces.length} total
          </span>
        </div>
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b bg-muted/25 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Members</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="w-28 px-4 py-3 text-right font-medium">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {availableWorkspaces.map((workspace) => {
                const selected = selectedWorkspace?.id === workspace.id;
                const current = currentWorkspace?.id === workspace.id;
                return (
                  <tr
                    key={workspace.id}
                    className={cn(
                      "transition-colors hover:bg-muted/25",
                      selected && "bg-primary/[0.035]",
                    )}
                  >
                    <td className="p-2">
                      <button
                        type="button"
                        className="flex min-h-11 w-full items-center gap-3 rounded-md px-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
                        onClick={() => setSelectedId(workspace.id)}
                      >
                        <WorkspaceAvatar workspace={workspace} />
                        <span className="font-medium">{workspace.name}</span>
                      </button>
                    </td>
                    <td className="px-4 py-3 capitalize text-muted-foreground">
                      {workspace.type}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {workspace.memberCount}{" "}
                      {workspace.memberCount === 1 ? "member" : "members"}
                    </td>
                    <td className="px-4 py-3 capitalize text-muted-foreground">
                      {workspace.role}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {current ? (
                        <span className="inline-flex items-center gap-1 rounded-sm bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">
                          <Check className="size-3" />
                          Current
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void switchWorkspace(workspace.id)}
                        >
                          Switch
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="divide-y sm:hidden">
          {availableWorkspaces.map((workspace) => {
            const selected = selectedWorkspace?.id === workspace.id;
            const current = currentWorkspace?.id === workspace.id;
            return (
              <button
                key={workspace.id}
                type="button"
                className={cn(
                  "flex min-h-[72px] w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-muted/25 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/35",
                  selected && "bg-primary/[0.035]",
                )}
                onClick={() => setSelectedId(workspace.id)}
              >
                <WorkspaceAvatar workspace={workspace} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {workspace.name}
                  </span>
                  <span className="mt-0.5 block text-xs capitalize text-muted-foreground">
                    {workspace.type} · {workspace.memberCount}{" "}
                    {workspace.memberCount === 1 ? "member" : "members"} ·{" "}
                    {workspace.role}
                  </span>
                </span>
                {current ? (
                  <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                    Current
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      {selectedWorkspace ? (
        <section className="overflow-hidden rounded-lg border bg-background">
          <div className="flex min-h-[72px] items-center gap-3 border-b px-4">
            <WorkspaceAvatar
              className="size-10"
              workspace={selectedWorkspace}
            />
            <div className="min-w-0">
              <h2 className="truncate font-heading text-lg">
                {selectedWorkspace.name}
              </h2>
              <p className="text-xs capitalize text-muted-foreground">
                {selectedWorkspace.type} workspace · {selectedWorkspace.role}
              </p>
            </div>
          </div>
          <Tabs defaultValue="members">
            <TabsList variant="line" className="w-full justify-start px-2">
              <TabsTrigger value="members">
                <Users />
                Members
              </TabsTrigger>
              <TabsTrigger value="settings">
                <ShieldCheck />
                Settings
              </TabsTrigger>
            </TabsList>
            <TabsContent value="members" className="mt-0">
              <WorkspaceMembers workspace={selectedWorkspace} />
            </TabsContent>
            <TabsContent value="settings" className="mt-0">
              <WorkspaceSettings
                workspace={selectedWorkspace}
                onChanged={refreshWorkspaces}
                onDeleted={async () => {
                  const remaining = await refreshWorkspaces();
                  const fallback =
                    remaining.find(
                      (workspace) => workspace.id !== selectedWorkspace.id,
                    ) ?? remaining[0];
                  setSelectedId(fallback?.id);
                  if (
                    fallback &&
                    currentWorkspace?.id === selectedWorkspace.id
                  ) {
                    await switchWorkspace(fallback.id);
                  }
                }}
              />
            </TabsContent>
          </Tabs>
        </section>
      ) : null}

      {currentWorkspace ? (
        <CreateWorkspaceDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={async (workspace) => {
            await refreshWorkspaces();
            setSelectedId(workspace.id);
          }}
        />
      ) : null}
    </div>
  );
}

function CreateWorkspaceDialog({
  onCreated,
  onOpenChange,
  open,
}: {
  onCreated: (workspace: Workspace) => void | Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: () => createWorkspace({ name: name.trim() }),
    onSuccess: async (workspace) => {
      await onCreated(workspace);
      setName("");
      onOpenChange(false);
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create workspace</DialogTitle>
          <DialogDescription>
            Create an isolated team space for agents, extensions, models, and
            costs.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <div className="space-y-2 px-6 py-6">
            <Label htmlFor="new-workspace-name">Workspace name</Label>
            <Input
              id="new-workspace-name"
              className="h-11"
              placeholder="Platform Engineering"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
            {create.isError ? (
              <p className="text-sm text-destructive" role="alert">
                {create.error.message}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              className="h-11"
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              className="h-11"
              type="submit"
              disabled={!name.trim() || create.isPending}
            >
              {create.isPending ? <Spinner /> : <Building2 />}
              Create workspace
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function WorkspaceSettings({
  onChanged,
  onDeleted,
  workspace,
}: {
  onChanged: () => Promise<Workspace[]>;
  onDeleted: () => void | Promise<void>;
  workspace: Workspace;
}) {
  const permissions = useWorkspacePermissions(workspace.role);
  const [name, setName] = useState(workspace.name);
  useEffect(() => setName(workspace.name), [workspace.id, workspace.name]);
  const rename = useMutation({
    mutationFn: () => renameWorkspace(workspace.id, name.trim()),
    onSuccess: () => onChanged(),
  });
  const remove = useMutation({
    mutationFn: () => deleteWorkspace(workspace.id),
    onSuccess: () => onDeleted(),
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (name.trim() && name.trim() !== workspace.name) rename.mutate();
  };

  return (
    <div className="divide-y">
      <form
        className="grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
        onSubmit={submit}
      >
        <div className="space-y-2">
          <Label htmlFor={`workspace-name-${workspace.id}`}>
            Workspace name
          </Label>
          <Input
            id={`workspace-name-${workspace.id}`}
            className="h-11 max-w-lg"
            value={name}
            disabled={!permissions.canManageWorkspace}
            onChange={(event) => setName(event.target.value)}
          />
          {!permissions.canManageWorkspace ? (
            <p className="text-xs text-muted-foreground">
              Members have view-only access to workspace settings.
            </p>
          ) : null}
          {rename.isError ? (
            <p className="text-sm text-destructive" role="alert">
              {rename.error.message}
            </p>
          ) : null}
        </div>
        {permissions.canManageWorkspace ? (
          <Button
            className="h-11"
            type="submit"
            variant="outline"
            disabled={
              rename.isPending ||
              !name.trim() ||
              name.trim() === workspace.name
            }
          >
            {rename.isPending ? <Spinner /> : null}
            Save name
          </Button>
        ) : null}
      </form>

      <div className="grid gap-1 p-5 text-sm">
        <span className="font-medium">Workspace ID</span>
        <code className="text-xs text-muted-foreground">{workspace.id}</code>
      </div>

      {permissions.canDeleteWorkspace && workspace.type !== "personal" ? (
        <div className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
          <div>
            <h3 className="text-sm font-semibold text-destructive">
              Delete workspace
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Permanently remove this workspace and its isolated resources.
            </p>
          </div>
          <Button
            className="h-11"
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => {
              if (
                window.confirm(
                  `Delete ${workspace.name}? This action cannot be undone.`,
                )
              ) {
                remove.mutate();
              }
            }}
          >
            {remove.isPending ? <Spinner /> : <Trash2 />}
            Delete workspace
          </Button>
          {remove.isError ? (
            <p className="text-sm text-destructive" role="alert">
              {remove.error.message}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
