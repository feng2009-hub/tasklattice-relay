import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Check,
  ChevronDown,
  FolderKanban,
  LoaderCircle,
  Plus,
  Settings,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useProject } from "@/hooks/use-project";
import { useProjectPermissions } from "@/hooks/use-project-permissions";
import { cn } from "@/lib/utils";
import { getSidebarMessages } from "@/lib/sidebar-i18n";
import type { AccountLanguage } from "@/services/personal-profile";

export function ProjectSwitcher({
  collapsed = false,
  language,
  onCreateProject,
  onProjectSettingsOpen,
  onProjectSwitchSuccess,
}: {
  collapsed?: boolean;
  language: AccountLanguage;
  onCreateProject: () => void;
  onProjectSettingsOpen: () => void;
  onProjectSwitchSuccess: (projectName: string) => void;
}) {
  const messages = getSidebarMessages(language);
  const {
    availableProjects: projects,
    currentProject,
    isSwitching,
    loading,
    selectProject,
    switchingProjectId,
  } = useProject();
  const permissions = useProjectPermissions();
  const [open, setOpen] = useState(false);
  const [switchError, setSwitchError] = useState("");

  const handleSelect = async (projectId: string, projectName: string) => {
    if (projectId === currentProject?.id || isSwitching) return;
    setSwitchError("");
    try {
      await selectProject(projectId);
      setOpen(false);
      onProjectSwitchSuccess(projectName);
    } catch (reason) {
      setSwitchError(
        reason instanceof Error ? reason.message : messages.projectSwitcher.switchError,
      );
    }
  };

  if (loading && !currentProject) {
    return (
      <div
        aria-label={messages.projectSwitcher.loading}
        className={cn(
          "h-11 animate-pulse rounded-sm bg-muted/70",
          collapsed ? "w-11" : "w-full",
        )}
      />
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={
              currentProject
                ? messages.projectSwitcher.currentProject(currentProject.name)
                : messages.projectSwitcher.noProject
            }
            className={cn(
              "group flex min-h-11 items-center rounded-sm border border-sidebar-border bg-sidebar px-2.5 text-left outline-none transition-colors",
              "hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring/35 data-[state=open]:border-primary/25 data-[state=open]:bg-primary/[0.06]",
              collapsed
                ? "mx-auto size-11 justify-center px-0"
                : "w-full gap-2.5",
            )}
            disabled={isSwitching}
          >
            <span className="grid size-6 shrink-0 place-items-center text-muted-foreground">
              <FolderKanban className="size-4" />
            </span>
            {collapsed ? null : (
              <>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {currentProject?.name ?? messages.projectSwitcher.noProject}
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
            {messages.projectSwitcher.projects}
          </DropdownMenuLabel>
          {projects.map((project) => {
            const current = project.id === currentProject?.id;
            const switching = project.id === switchingProjectId;
            return (
              <div
                key={project.id}
                role="group"
                className={cn(
                  "flex items-stretch rounded-sm",
                  current && "bg-primary/[0.07] text-primary",
                )}
              >
                <DropdownMenuItem
                  className={cn(
                    "min-w-0 flex-1",
                    current && [
                      "bg-transparent text-primary data-disabled:opacity-100 focus:bg-primary/[0.1] focus:text-primary",
                      permissions.canManageProject && "rounded-r-none",
                    ],
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
                {current && permissions.canManageProject ? (
                  <DropdownMenuItem
                    asChild
                    className="w-11 justify-center rounded-l-none border-l border-primary/15 px-0 text-primary focus:bg-primary/[0.1] focus:text-primary"
                  >
                    <Link
                      to="/$projectId/setting"
                      params={{ projectId: project.id }}
                      aria-label={messages.projectSwitcher.projectSettings(project.name)}
                      title={messages.projectSwitcher.projectSettings(project.name)}
                      onClick={() => {
                        setOpen(false);
                        onProjectSettingsOpen();
                      }}
                    >
                      <Settings className="size-4" />
                    </Link>
                  </DropdownMenuItem>
                ) : null}
              </div>
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
              onCreateProject();
            }}
          >
            <Plus className="size-4" />
            {messages.projectSwitcher.newProject}
          </DropdownMenuItem>
        </DropdownMenuContent>
    </DropdownMenu>
  );
}
