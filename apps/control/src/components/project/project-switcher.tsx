import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  FolderKanban,
  LoaderCircle,
  LogOut,
  Plus,
  Settings,
  Unplug,
} from "lucide-react";
import type { AuthUser } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";
import { useProject } from "@/hooks/use-project";
import { useProjectPermissions } from "@/hooks/use-project-permissions";
import { cn } from "@/lib/utils";
import { createProject } from "@/services/project";

export function ProjectSwitcher({
  collapsed = false,
  onLogout,
  user,
}: {
  collapsed?: boolean;
  onLogout: () => void | Promise<void>;
  user: AuthUser | null;
}) {
  const {
    availableProjects: projects,
    currentProject,
    isSwitching,
    loading,
    refreshProjects,
    selectProject,
    switchingProjectId,
  } = useProject();
  const permissions = useProjectPermissions();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [switchError, setSwitchError] = useState("");
  const [toastProject, setToastProject] = useState("");

  const handleSelect = async (projectId: string, projectName: string) => {
    if (projectId === currentProject?.id || isSwitching) return;
    setSwitchError("");
    try {
      await selectProject(projectId);
      setOpen(false);
      setToastProject(projectName);
    } catch (reason) {
      setSwitchError(
        reason instanceof Error ? reason.message : "Unable to switch projects.",
      );
    }
  };

  if (loading && !currentProject) {
    return (
      <div
        aria-label="Loading project"
        className={cn(
          "h-11 animate-pulse rounded-sm bg-muted/70",
          collapsed ? "w-11" : "w-full",
        )}
      />
    );
  }

  return (
    <ToastProvider duration={3_000} swipeDirection="right">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={
              currentProject
                ? `Current project: ${currentProject.name}. Switch project`
                : "No project available"
            }
            className={cn(
              "group flex min-h-11 items-center rounded-sm border border-sidebar-border bg-sidebar px-2.5 text-left outline-none transition-colors",
              "hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring/35 data-[state=open]:border-primary/25 data-[state=open]:bg-primary/[0.06]",
              collapsed ? "w-11 justify-center px-0" : "w-full gap-2.5",
            )}
            disabled={!currentProject || isSwitching}
          >
            <span className="grid size-6 shrink-0 place-items-center text-muted-foreground">
              <FolderKanban className="size-4" />
            </span>
            {collapsed ? null : (
              <>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {currentProject?.name ?? "No project available"}
                </span>
                {isSwitching ? (
                  <LoaderCircle className="size-4 shrink-0 animate-spin text-muted-foreground" />
                ) : (
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                )}
              </>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side={collapsed ? "right" : "bottom"}
          className="w-72"
        >
          <DropdownMenuLabel className="px-2 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            Projects
          </DropdownMenuLabel>
          {projects.map((project) => {
            const current = project.id === currentProject?.id;
            const switching = project.id === switchingProjectId;
            return (
              <DropdownMenuItem
                key={project.id}
                className={cn(
                  "min-h-11",
                  current && "bg-primary/[0.07] text-primary focus:bg-primary/[0.1] focus:text-primary",
                )}
                disabled={current || isSwitching}
                onSelect={(event) => {
                  event.preventDefault();
                  void handleSelect(project.id, project.name);
                }}
              >
                <span className="grid size-5 shrink-0 place-items-center">
                  {switching ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : current ? (
                    <Check className="size-4" />
                  ) : (
                    <span className="size-4" aria-hidden="true" />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate">{project.name}</span>
              </DropdownMenuItem>
            );
          })}
          {switchError ? (
            <p
              className="mx-1 my-1 border-l-2 border-destructive bg-destructive/5 px-2 py-2 text-xs text-destructive"
              role="alert"
            >
              {switchError}
            </p>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!permissions.canCreateProject}
            onSelect={() => {
              setOpen(false);
              setCreateOpen(true);
            }}
          >
            <Plus className="size-4" />
            New Project
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link
              to="/$projectId/setting"
              params={{ projectId: currentProject?.id ?? "individual" }}
              onClick={() => setOpen(false)}
            >
              <Settings className="size-4" />
              Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link
              to="/$projectId/mcp-servers"
              params={{ projectId: currentProject?.id ?? "individual" }}
              onClick={() => setOpen(false)}
            >
              <Unplug className="size-4" />
              Integrations
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
            onSelect={() => void onLogout()}
          >
            <LogOut className="size-4" />
            Sign out
            <span className="sr-only">{user?.displayName || user?.username}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={async (projectId, projectName) => {
          await refreshProjects();
          await selectProject(projectId);
          setToastProject(projectName);
        }}
      />

      <Toast
        open={Boolean(toastProject)}
        onOpenChange={(next) => {
          if (!next) setToastProject("");
        }}
        className="border-emerald-500/30 border-l-2"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-emerald-500/10 text-emerald-700">
            <CheckCircle2 className="size-4" />
          </span>
          <span>
            <ToastTitle>Project switched</ToastTitle>
            <ToastDescription>
              <strong className="block font-medium text-foreground">
                {toastProject}
              </strong>
              Resources updated
            </ToastDescription>
          </span>
        </div>
        <ToastClose />
      </Toast>
      <ToastViewport />
    </ToastProvider>
  );
}

function CreateProjectDialog({
  onCreated,
  onOpenChange,
  open,
}: {
  onCreated: (projectId: string, projectName: string) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: () => createProject({ name: name.trim() }),
    onSuccess: async (project) => {
      await onCreated(project.id, project.name);
      setName("");
      onOpenChange(false);
    },
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (name.trim()) create.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !create.isPending && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
          <DialogDescription>
            Create an isolated context for agents, models, extensions, policies,
            and cost data.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <div className="space-y-2 px-6 py-6">
            <Label htmlFor="new-project-name">Project name</Label>
            <Input
              id="new-project-name"
              className="h-11"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Web3 Analytics"
              required
              autoFocus
            />
            {create.error ? (
              <p className="text-sm text-destructive" role="alert">
                {create.error.message}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || create.isPending}>
              {create.isPending ? <Spinner /> : <Plus />}
              Create Project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
