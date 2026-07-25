import { Fragment, useEffect, useState } from "react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  Boxes,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  CircleHelp,
  FileLock2,
  FileClock,
  Network,
  Search,
  ServerCog,
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
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
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
  | "/$projectId/models"
  | "/$projectId/cost"
  | "/$projectId/instances"
  | "/$projectId/requests/new"
  | "/$projectId/access-policies"
  | "/$projectId/runtime-policies"
  | "/$projectId/knowledge-base"
  | "/$projectId/mcp-servers"
  | "/$projectId/skills"
  | "/$projectId/requests";

type NavItemDefinition = {
  icon: LucideIcon;
  label: string;
  preview?: boolean;
  to: ProjectRoute;
};

const navGroups: Array<{ items: NavItemDefinition[]; label: string }> = [
  {
    label: "Agentic",
    items: [
      { icon: Boxes, label: "Instances", to: "/$projectId/instances" },
      { icon: Sparkles, label: "Skills", to: "/$projectId/skills" },
      { icon: ServerCog, label: "MCP Servers", to: "/$projectId/mcp-servers" },
      { icon: Network, label: "Knowledge Base", to: "/$projectId/knowledge-base" },
    ],
  },
  {
    label: "Security",
    items: [
      {
        icon: ShieldCheck,
        label: "Access Policies",
        preview: true,
        to: "/$projectId/access-policies",
      },
      { icon: FileLock2, label: "Runtime Policies", to: "/$projectId/runtime-policies" },
    ],
  },
  {
    label: "Observer",
    items: [{ icon: CircleDollarSign, label: "Cost", to: "/$projectId/cost" }],
  },
];

function itemIsActive(item: NavItemDefinition, pathname: string, projectId: string) {
  const target = item.to.replace("$projectId", encodeURIComponent(projectId));
  if (
    item.to === "/$projectId/instances" ||
    item.to === "/$projectId/access-policies"
  )
    return pathname === target || pathname.startsWith(`${target}/`);
  return pathname === target;
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
          {item.preview ? (
            <span className="ml-auto rounded-sm border border-primary/20 bg-primary/5 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary group-data-[collapsible=icon]:hidden">
              Preview
            </span>
          ) : null}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function DisabledNav({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        aria-label={label}
        disabled
        tooltip={`${label} — not part of the current Agent operating path.`}
      >
        <Icon />
        <span>{label}</span>
        <span className="ml-auto bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide group-data-[collapsible=icon]:hidden">Later</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function ProjectSidebar({ logout, pathname, user }: {
  logout: () => void | Promise<void>;
  pathname: string;
  user: AuthUser | null;
}) {
  const { isMobile, setOpenMobile, state } = useSidebar();
  const {
    currentProject,
    refreshProjects,
    selectProject,
  } = useProject();
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [toastProject, setToastProject] = useState("");
  const projectId = currentProject?.id ?? "individual";
  return (
    <ToastProvider duration={3_000} swipeDirection="right">
      <Sidebar collapsible="icon">
        <SidebarHeader className="gap-1.5 border-b border-sidebar-border p-2">
          <Link to="/$projectId" params={{ projectId }} onClick={() => setOpenMobile(false)} className="flex min-h-11 min-w-0 items-center gap-3 px-2 focus-visible:outline-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0" aria-label="TaskLattice home">
            <BrandLogo compact={!isMobile && state === "collapsed"} />
          </Link>
          <ProjectSwitcher
            collapsed={!isMobile && state === "collapsed"}
            onCreateProject={() => {
              setOpenMobile(false);
              setCreateProjectOpen(true);
            }}
            onLogout={logout}
            onProjectSwitchSuccess={(projectName) => {
              setOpenMobile(false);
              setToastProject(projectName);
            }}
            user={user}
          />
        </SidebarHeader>
        <SidebarContent>
          <nav aria-label="Project navigation" className="flex flex-col py-1">
            {navGroups.map((group) => (
              <SidebarGroup key={group.label}>
                <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item, index) => (
                      <Fragment key={item.to}>
                        {group.label === "Agentic" && index === 1 ? <DisabledNav icon={Bot} label="Agent Garden" /> : null}
                        {group.label === "Observer" && index === 0 ? <DisabledNav icon={Waypoints} label="Traces" /> : null}
                        <NavigationItem item={item} pathname={pathname} projectId={projectId} />
                      </Fragment>
                    ))}
                    {group.label === "Security" ? <DisabledNav icon={FileClock} label="Audit Logs" /> : null}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </nav>
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border p-2">
          <SidebarMenu>
            <DisabledNav icon={CircleHelp} label="Help & documentation" />
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
        onOpenChange={setCreateProjectOpen}
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
  const {
    currentProject,
    error: projectError,
    loading: projectLoading,
    refreshProjects,
  } = useProject();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    setSidebarOpen(window.localStorage.getItem("tasklattice.sidebar.collapsed") !== "true");
  }, []);

  const handleSidebarOpenChange = (open: boolean) => {
    setSidebarOpen(open);
    window.localStorage.setItem("tasklattice.sidebar.collapsed", String(!open));
  };

  return (
    <TooltipProvider delayDuration={250}>
      <SidebarProvider open={sidebarOpen} onOpenChange={handleSidebarOpenChange}>
        <ProjectSidebar
          logout={logout}
          pathname={pathname}
          user={user}
        />
        <SidebarInset>
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/94 px-4 backdrop-blur-md sm:px-6 lg:px-8">
            <SidebarTrigger />
            <HeaderBreadcrumb pathname={pathname} />
            <button disabled className="ml-auto hidden h-9 w-64 cursor-not-allowed items-center gap-2 rounded-md border border-border/70 bg-muted/30 px-3 text-sm text-muted-foreground/45 md:flex"><Search className="size-3.5" />Search project<span className="ml-auto text-[10px] uppercase">Later</span></button>
          </header>
          <main id="main-content" className="mx-auto w-full max-w-[1320px] p-5 sm:p-6 lg:px-8 lg:py-6">
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
                <Button className="mt-5" onClick={() => void refreshProjects()}>
                  Reload projects
                </Button>
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
