import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Building2,
  Check,
  ChevronDown,
  LoaderCircle,
  Plus,
  Settings,
  SlidersHorizontal,
} from "lucide-react";
import { ProjectAvatar } from "@/components/project/project-item";
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
import { getDepartments } from "@/services/department";
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
  const administeredDepartments = useQuery({
    queryKey: ["departments"],
    queryFn: getDepartments,
    staleTime: 30_000,
  });
  const [open, setOpen] = useState(false);
  const [switchError, setSwitchError] = useState("");
  const departmentGroups = Array.from(
    projects.reduce(
      (groups, project) => {
        const current = groups.get(project.department.id) ?? {
          department: project.department,
          projects: [],
        };
        current.projects.push(project);
        groups.set(project.department.id, current);
        return groups;
      },
      new Map<
        string,
        {
          department: (typeof projects)[number]["department"];
          projects: typeof projects;
        }
      >(),
    ),
  ).map(([, group]) => group);
  const showDepartmentGroups = departmentGroups.length > 1;

  const handleSelect = async (projectId: string, projectName: string) => {
    if (projectId === currentProject?.id || isSwitching) return;
    setSwitchError("");
    try {
      await selectProject(projectId);
      setOpen(false);
      onProjectSwitchSuccess(projectName);
    } catch (reason) {
      setSwitchError(
        reason instanceof Error
          ? reason.message
          : messages.projectSwitcher.switchError,
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
              ? messages.projectSwitcher.currentProject(
                  `${currentProject.department.name}/${currentProject.name}`,
                )
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
          {currentProject ? (
            <ProjectAvatar className="size-6" project={currentProject} />
          ) : (
            <span
              aria-hidden="true"
              className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
            >
              P
            </span>
          )}
          {collapsed ? null : (
            <>
              <span
                className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground"
                title={
                  currentProject
                    ? `${currentProject.department.name}/${currentProject.name}`
                    : undefined
                }
              >
                {currentProject ? (
                  currentProject.name
                ) : (
                  messages.projectSwitcher.noProject
                )}
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
        {departmentGroups.map((group, groupIndex) => (
          <div key={group.department.id}>
            {showDepartmentGroups && groupIndex ? (
              <DropdownMenuSeparator />
            ) : null}
            {showDepartmentGroups ? (
              <DropdownMenuLabel className="flex items-center gap-2 px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground">
                <Building2 className="size-3.5" />
                <span className="min-w-0 flex-1 truncate">
                  {group.department.name}
                </span>
                <span className="font-mono text-[10px] tabular-nums">
                  {group.projects.length}
                </span>
              </DropdownMenuLabel>
            ) : null}
            {group.projects.map((project, projectIndex) => {
              const current = project.id === currentProject?.id;
              const switching = project.id === switchingProjectId;
              const lastProject = projectIndex === group.projects.length - 1;
              return (
                <div
                  key={project.id}
                  className={cn(
                    showDepartmentGroups &&
                      "relative pl-5 before:pointer-events-none before:absolute before:left-[15px] before:top-0 before:w-px before:bg-border after:pointer-events-none after:absolute after:left-[15px] after:top-1/2 after:h-px after:w-3 after:bg-border",
                    showDepartmentGroups &&
                      (lastProject ? "before:h-1/2" : "before:h-full"),
                  )}
                >
                  <div
                    role="group"
                    className={cn(
                      "flex items-stretch rounded-sm",
                      current && "bg-primary/[0.07] text-primary",
                    )}
                  >
                    <DropdownMenuItem
                      className={cn(
                        "min-h-11 min-w-0 flex-1",
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
                      <ProjectAvatar className="size-6" project={project} />
                      <span className="min-w-0 flex-1 truncate">
                        {project.name}
                      </span>
                      {switching ? (
                        <LoaderCircle className="size-4 shrink-0 animate-spin" />
                      ) : current ? (
                        <Check className="size-4 shrink-0" />
                      ) : null}
                    </DropdownMenuItem>
                    {current && permissions.canManageProject ? (
                      <DropdownMenuItem
                        asChild
                        className="min-h-11 w-11 justify-center rounded-l-none border-l border-primary/15 px-0 text-primary focus:bg-primary/[0.1] focus:text-primary"
                      >
                        <Link
                          to="/$projectId/setting"
                          params={{ projectId: project.id }}
                          aria-label={messages.projectSwitcher.projectSettings(
                            project.name,
                          )}
                          title={messages.projectSwitcher.projectSettings(
                            project.name,
                          )}
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
                </div>
              );
            })}
          </div>
        ))}
        {switchError ? (
          <p
            className="mx-1 my-1 border-l-2 border-destructive bg-destructive/5 px-2 py-2 text-xs text-destructive"
            role="alert"
          >
            {switchError}
          </p>
        ) : null}
        <DropdownMenuSeparator />
        {currentProject?.department.role === "administrator" ? (
          <DropdownMenuItem asChild>
            <Link
              to="/departments/$departmentId"
              params={{ departmentId: currentProject.department.id }}
              onClick={() => {
                setOpen(false);
                onProjectSettingsOpen();
              }}
            >
              <SlidersHorizontal className="size-4" />
              Manage {currentProject.department.name}
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          disabled={
            administeredDepartments.isPending ||
            !administeredDepartments.data?.length
          }
          onSelect={() => {
            setOpen(false);
            onCreateProject();
          }}
        >
          {administeredDepartments.isPending ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          {administeredDepartments.isPending
            ? "Checking Department access…"
            : messages.projectSwitcher.newProject}
        </DropdownMenuItem>
        {!administeredDepartments.isPending &&
        !administeredDepartments.data?.length ? (
          <p className="px-2 pb-1 text-[11px] leading-4 text-muted-foreground">
            Department Administrator role is required to create Projects.
          </p>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
