import { Fragment, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  Bot,
  Boxes,
  BrainCircuit,
  CheckCircle2,
  CircleDollarSign,
  CircleHelp,
  FileLock2,
  FileClock,
  Network,
  Search,
  ServerCog,
  Settings,
  ShieldCheck,
  Sparkles,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import type { AuthUser } from "@/components/auth/auth-provider";
import { useAuth } from "@/components/auth/auth-provider";
import { AccountMenu } from "@/components/account/account-menu";
import { BrandLogo } from "@/components/brand/brand-logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useProject } from "@/hooks/use-project";
import { useProjectPermissions } from "@/hooks/use-project-permissions";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { applyPlatformPreferences, getPlatformTheme } from "@/lib/platform-preferences";
import {
  getPersonalProfile,
  personalProfileQueryKey,
} from "@/services/personal-profile";
import { HeaderBreadcrumb } from "@/components/layout/header-breadcrumb";
import { CreateProjectSheet } from "@/components/project/create-project-sheet";
import { ProjectSwitcher } from "@/components/project/project-switcher";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";

type ProjectRoute =
  | "/$projectId"
  | "/$projectId/agent-garden"
  | "/$projectId/cost"
  | "/$projectId/traces"
  | "/$projectId/instances"
  | "/$projectId/requests/new"
  | "/$projectId/access-policies"
  | "/$projectId/audit-logs"
  | "/$projectId/runtime-policies"
  | "/$projectId/knowledge-base"
  | "/$projectId/memory"
  | "/$projectId/mcp-servers"
  | "/$projectId/skills"
  | "/$projectId/setting"
  | "/$projectId/requests";

type NavItemDefinition = {
  icon: LucideIcon;
  label: string;
  to: ProjectRoute;
};

type NavGroupDefinition = {
  items: NavItemDefinition[];
  label: string;
};

export const navGroups: NavGroupDefinition[] = [
  {
    label: "Home",
    items: [
      { icon: Boxes, label: "Instances", to: "/$projectId/instances" },
      { icon: BrainCircuit, label: "Memory", to: "/$projectId/memory" },
    ],
  },
  {
    label: "Capability toolbox",
    items: [
      { icon: Bot, label: "Specialist Agents", to: "/$projectId/agent-garden" },
      { icon: Sparkles, label: "Skills", to: "/$projectId/skills" },
      { icon: ServerCog, label: "MCP Connections", to: "/$projectId/mcp-servers" },
      { icon: Network, label: "Knowledge Sources", to: "/$projectId/knowledge-base" },
    ],
  },
  {
    label: "Governance",
    items: [
      {
        icon: ShieldCheck,
        label: "Access Policies",
        to: "/$projectId/access-policies",
      },
      { icon: FileLock2, label: "Runtime Policies", to: "/$projectId/runtime-policies" },
      { icon: Settings, label: "Project Settings", to: "/$projectId/setting" },
    ],
  },
  {
    label: "Evidence",
    items: [
      { icon: Waypoints, label: "Traces", to: "/$projectId/traces" },
      { icon: FileClock, label: "Audit Logs", to: "/$projectId/audit-logs" },
      { icon: CircleDollarSign, label: "Cost", to: "/$projectId/cost" },
    ],
  },
];

export function itemIsActive(item: NavItemDefinition, pathname: string, projectId: string) {
  const target = item.to.replace("$projectId", encodeURIComponent(projectId));
  const normalizedPathname = pathname.replace(/\/$/, "");
  const normalizedTarget = target.replace(/\/$/, "");
  if (normalizedPathname === normalizedTarget) return true;
  return normalizedPathname.startsWith(`${normalizedTarget}/`);
}

function NavigationItem({ item, pathname, projectId }: {
  item: NavItemDefinition;
  pathname: string;
  projectId: string;
}) {
  const { setOpenMobile } = useSidebar();
  const active = itemIsActive(item, pathname, projectId);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
        <Link
          to={item.to}
          params={{ projectId }}
          onClick={() => setOpenMobile(false)}
          aria-current={active ? "page" : undefined}
          aria-label={item.label}
        >
          <item.icon className={cn(active && "text-primary")} />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function DisabledNav({ description, icon: Icon, label }: { description: string; icon: LucideIcon; label: string }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        aria-label={label}
        disabled
        tooltip={description}
      >
        <Icon />
        <span>{label}</span>
        <span className="ml-auto bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide group-data-[collapsible=icon]:hidden">Later</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function ProjectSidebar({ createProjectOpen, logout, onCreateProjectOpenChange, pathname, user }: {
  createProjectOpen: boolean;
  logout: () => void | Promise<void>;
  onCreateProjectOpenChange: (open: boolean) => void;
  pathname: string;
  user: AuthUser | null;
}) {
  const { isMobile, setOpenMobile, state } = useSidebar();
  const {
    currentProject,
    refreshProjects,
    selectProject,
  } = useProject();
  const [toastProject, setToastProject] = useState("");
  const projectId = currentProject?.id ?? "individual";
  const permissions = useProjectPermissions();
  return (
    <ToastProvider duration={3_000} swipeDirection="right">
      <Sidebar collapsible="icon">
        <SidebarHeader className="gap-1.5 border-b border-sidebar-border p-2">
          <Link to="/$projectId" params={{ projectId }} onClick={() => setOpenMobile(false)} className="flex min-h-11 min-w-0 items-center gap-3 px-2 focus-visible:outline-2 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-11 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0" aria-label="TaskLattice Relay home">
            <BrandLogo compact={!isMobile && state === "collapsed"} />
          </Link>
          <ProjectSwitcher
            collapsed={!isMobile && state === "collapsed"}
            onCreateProject={() => {
              setOpenMobile(false);
              onCreateProjectOpenChange(true);
            }}
            onProjectSwitchSuccess={(projectName) => {
              setOpenMobile(false);
              setToastProject(projectName);
            }}
          />
        </SidebarHeader>
        <SidebarContent>
          <nav aria-label="Project navigation" className="flex flex-col py-1">
            {currentProject ? navGroups.map((group) => (
              <SidebarGroup key={group.label}>
                <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items
                      .filter((item) =>
                        (item.to !== "/$projectId/audit-logs" || permissions.canViewAuditLogs)
                        && (item.to !== "/$projectId/setting" || permissions.canManageProject),
                      )
                      .map((item) => (
                        <Fragment key={item.to}>
                          <NavigationItem item={item} pathname={pathname} projectId={projectId} />
                        </Fragment>
                      ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )) : null}
          </nav>
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border p-2">
          <SidebarMenu>
            <DisabledNav
              description="Help and documentation are planned for a later control-plane release."
              icon={CircleHelp}
              label="Help & documentation"
            />
          </SidebarMenu>
          <div className="mt-1 border-t border-sidebar-border pt-2">
            <AccountMenu
              collapsed={!isMobile && state === "collapsed"}
              onLogout={logout}
              projectId={projectId}
              user={user}
            />
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <CreateProjectSheet
        open={createProjectOpen}
        onOpenChange={onCreateProjectOpenChange}
        user={user}
        onCreated={async (createdProjectId, projectName) => {
          await refreshProjects();
          await selectProject(createdProjectId);
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

export function AppShell() {
  const { logout, user } = useAuth();
  const account = useQuery({
    queryKey: personalProfileQueryKey,
    queryFn: getPersonalProfile,
    staleTime: 5 * 60_000,
  });
  const {
    currentProject,
    error: projectError,
    loading: projectLoading,
    refreshProjects,
  } = useProject();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    if (account.data) {
      applyPlatformPreferences(account.data);
    }
  }, [account.data]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemTheme = () => {
      if (getPlatformTheme() === "system") {
        document.documentElement.classList.toggle("dark", media.matches);
        document.documentElement.style.colorScheme = media.matches ? "dark" : "light";
      }
    };
    media.addEventListener("change", syncSystemTheme);
    return () => media.removeEventListener("change", syncSystemTheme);
  }, []);

  useEffect(() => {
    setSidebarOpen(window.localStorage.getItem("tali.sidebar.collapsed") !== "true");
  }, []);

  const handleSidebarOpenChange = (open: boolean) => {
    setSidebarOpen(open);
    window.localStorage.setItem("tali.sidebar.collapsed", String(!open));
  };

  return (
    <TooltipProvider delayDuration={250}>
      <SidebarProvider open={sidebarOpen} onOpenChange={handleSidebarOpenChange}>
        <ProjectSidebar
          createProjectOpen={createProjectOpen}
          logout={logout}
          onCreateProjectOpenChange={setCreateProjectOpen}
          pathname={pathname}
          user={user}
        />
        <SidebarInset>
          <div className="sticky top-0 z-30 bg-background/94 backdrop-blur-md">
            <header className="flex h-16 items-center gap-3 border-b px-4 sm:px-6 lg:px-8">
              <SidebarTrigger />
              <HeaderBreadcrumb pathname={pathname} />
              <button disabled className="ml-auto hidden h-9 w-64 cursor-not-allowed items-center gap-2 rounded-md border border-border/70 bg-muted/30 px-3 text-sm text-muted-foreground/45 md:flex"><Search className="size-3.5" />Search project<span className="ml-auto text-[10px] uppercase">Later</span></button>
            </header>
          </div>
          <main
            id="main-content"
            className={cn(
              "mx-auto w-full p-5 sm:p-6 lg:py-6",
              sidebarOpen ? "max-w-[1600px]" : "max-w-none",
            )}
          >
            {projectError ? (
              <div role="status" className="mb-5 border-l-2 border-amber-500 bg-amber-500/5 px-4 py-3 text-sm text-amber-900">
                {projectError}
              </div>
            ) : null}
            {projectLoading ? (
              <div className="space-y-6" aria-label="Loading project data">
                <div className="h-20 animate-pulse rounded-md bg-muted/70" />
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="h-28 animate-pulse rounded-md bg-muted/60" />
                  <div className="h-28 animate-pulse rounded-md bg-muted/60" />
                  <div className="h-28 animate-pulse rounded-md bg-muted/60" />
                </div>
                <div className="h-64 animate-pulse rounded-md bg-muted/50" />
              </div>
            ) : !currentProject ? (
              <section className="mx-auto max-w-md py-20 text-center" aria-labelledby="no-project-title">
                <h1 id="no-project-title" className="text-lg font-semibold">
                  No project available
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Create a Project before resources can be loaded.
                </p>
                <div className="mt-5 flex justify-center gap-3">
                  <Button onClick={() => setCreateProjectOpen(true)}>
                    Create Project
                  </Button>
                  <Button variant="outline" onClick={() => void refreshProjects()}>
                    Reload
                  </Button>
                </div>
              </section>
            ) : (
              <div key={currentProject.id}>
                <Outlet />
              </div>
            )}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
