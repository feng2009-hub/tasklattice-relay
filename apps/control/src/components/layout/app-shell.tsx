import { useEffect, useState } from "react";
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
import { usePlatformLanguage } from "@/hooks/use-platform-language";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { applyPlatformPreferences, getPlatformTheme } from "@/lib/platform-preferences";
import {
  getSidebarMessages,
  type SidebarNavigationGroupKey,
  type SidebarNavigationItemKey,
} from "@/lib/sidebar-i18n";
import {
  getPersonalProfile,
  personalProfileQueryKey,
} from "@/services/personal-profile";
import type { AccountLanguage } from "@/services/personal-profile";
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
  | "/$projectId/help"
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
  | "/$projectId/requests";

type NavItemDefinition = {
  icon: LucideIcon;
  labelKey: SidebarNavigationItemKey;
  label: string;
  to: ProjectRoute;
};

type NavGroupDefinition = {
  items: NavItemDefinition[];
  labelKey: SidebarNavigationGroupKey;
  label: string;
};

const navGroupDefinitions: Array<{
  items: Array<Omit<NavItemDefinition, "label">>;
  labelKey: SidebarNavigationGroupKey;
}> = [
  {
    labelKey: "home",
    items: [
      { icon: Boxes, labelKey: "instances", to: "/$projectId/instances" },
      { icon: BrainCircuit, labelKey: "memory", to: "/$projectId/memory" },
    ],
  },
  {
    labelKey: "capabilityToolbox",
    items: [
      { icon: Bot, labelKey: "specialistAgents", to: "/$projectId/agent-garden" },
      { icon: Sparkles, labelKey: "skills", to: "/$projectId/skills" },
      { icon: ServerCog, labelKey: "mcpConnections", to: "/$projectId/mcp-servers" },
      { icon: Network, labelKey: "knowledgeSources", to: "/$projectId/knowledge-base" },
    ],
  },
  {
    labelKey: "governance",
    items: [
      {
        icon: ShieldCheck,
        labelKey: "accessPolicies",
        to: "/$projectId/access-policies",
      },
      { icon: FileLock2, labelKey: "runtimePolicies", to: "/$projectId/runtime-policies" },
    ],
  },
  {
    labelKey: "evidence",
    items: [
      { icon: Waypoints, labelKey: "traces", to: "/$projectId/traces" },
      { icon: FileClock, labelKey: "auditLogs", to: "/$projectId/audit-logs" },
      { icon: CircleDollarSign, labelKey: "cost", to: "/$projectId/cost" },
    ],
  },
];

export function getNavGroups(language: AccountLanguage): NavGroupDefinition[] {
  const messages = getSidebarMessages(language).navigation;
  return navGroupDefinitions.map((group) => ({
    labelKey: group.labelKey,
    label: messages.groups[group.labelKey],
    items: group.items.map((item) => ({
      ...item,
      label: messages.items[item.labelKey],
    })),
  }));
}

export const navGroups = getNavGroups("en-US");

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

function ProjectSidebar({ createProjectOpen, language, logout, onCreateProjectOpenChange, pathname, user }: {
  createProjectOpen: boolean;
  language: AccountLanguage;
  logout: () => void | Promise<void>;
  onCreateProjectOpenChange: (open: boolean) => void;
  pathname: string;
  user: AuthUser | null;
}) {
  const messages = getSidebarMessages(language);
  const localizedNavGroups = getNavGroups(language);
  const { isMobile, setOpenMobile, state } = useSidebar();
  const {
    currentProject,
    refreshProjects,
    selectProject,
  } = useProject();
  const [toastProject, setToastProject] = useState("");
  const projectId = currentProject?.id ?? "proj1";
  const permissions = useProjectPermissions();
  const helpActive = pathname.replace(/\/$/, "") === `/${encodeURIComponent(projectId)}/help`;
  return (
    <ToastProvider duration={3_000} swipeDirection="right">
      <Sidebar
        collapsible="icon"
        mobileDescription={messages.navigation.description}
        mobileTitle={messages.navigation.title}
      >
        <SidebarHeader className="gap-1.5 border-b border-sidebar-border p-2">
          <Link to="/$projectId" params={{ projectId }} onClick={() => setOpenMobile(false)} className="flex min-h-11 min-w-0 items-center gap-3 px-2 focus-visible:outline-2 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-11 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0" aria-label={messages.brandHome}>
            <BrandLogo compact={!isMobile && state === "collapsed"} />
          </Link>
          <ProjectSwitcher
            collapsed={!isMobile && state === "collapsed"}
            language={language}
            onCreateProject={() => {
              setOpenMobile(false);
              onCreateProjectOpenChange(true);
            }}
            onProjectSwitchSuccess={(projectName) => {
              setOpenMobile(false);
              setToastProject(projectName);
            }}
            onProjectSettingsOpen={() => setOpenMobile(false)}
          />
        </SidebarHeader>
        <SidebarContent>
          <nav aria-label={messages.navigation.title} className="flex flex-col py-1">
            {currentProject ? localizedNavGroups.map((group) => (
              <SidebarGroup key={group.labelKey}>
                <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items
                      .filter((item) =>
                        item.to !== "/$projectId/audit-logs" || permissions.canViewAuditLogs,
                      )
                      .map((item) => (
                        <NavigationItem
                          key={item.to}
                          item={item}
                          pathname={pathname}
                          projectId={projectId}
                        />
                      ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )) : null}
          </nav>
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border p-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={helpActive}
                tooltip={messages.help.label}
              >
                <Link
                  to="/$projectId/help"
                  params={{ projectId }}
                  onClick={() => setOpenMobile(false)}
                  aria-current={helpActive ? "page" : undefined}
                  aria-label={messages.help.label}
                >
                  <CircleHelp />
                  <span>{messages.help.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <div className="mt-1 border-t border-sidebar-border pt-2">
            <AccountMenu
              collapsed={!isMobile && state === "collapsed"}
              language={language}
              onLogout={logout}
              projectId={projectId}
              user={user}
            />
          </div>
        </SidebarFooter>
        <SidebarRail label={messages.navigation.toggle} />
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
            <ToastTitle>{messages.switchToast.title}</ToastTitle>
            <ToastDescription>
              <strong className="block font-medium text-foreground">
                {toastProject}
              </strong>
              {messages.switchToast.description}
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
  const language = usePlatformLanguage();
  const sidebarMessages = getSidebarMessages(language);
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
  const departmentRoute = pathname.startsWith("/departments/");
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
          language={language}
          logout={logout}
          onCreateProjectOpenChange={setCreateProjectOpen}
          pathname={pathname}
          user={user}
        />
        <SidebarInset>
          <div className="sticky top-0 z-30 bg-background/94 backdrop-blur-md">
            <header className="flex h-16 items-center gap-3 border-b px-4 sm:px-6 lg:px-8">
              <SidebarTrigger label={sidebarMessages.navigation.toggle} />
              <HeaderBreadcrumb pathname={pathname} />
              <button disabled className="ml-auto hidden h-9 w-64 cursor-not-allowed items-center gap-2 rounded-md border border-border/70 bg-muted/30 px-3 text-sm text-muted-foreground/45 md:flex"><Search className="size-3.5" />{sidebarMessages.search.label}<span className="ml-auto text-[10px] uppercase">{sidebarMessages.search.planned}</span></button>
            </header>
          </div>
          <main
            id="main-content"
            className={cn(
              "mx-auto w-full p-5 sm:p-6 lg:py-6",
              sidebarOpen ? "max-w-[1600px]" : "max-w-none",
            )}
          >
            {!departmentRoute && projectError ? (
              <div role="status" className="mb-5 border-l-2 border-amber-500 bg-amber-500/5 px-4 py-3 text-sm text-amber-900">
                {projectError}
              </div>
            ) : null}
            {!departmentRoute && projectLoading ? (
              <div className="space-y-6" aria-label="Loading project data">
                <div className="h-20 animate-pulse rounded-md bg-muted/70" />
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="h-28 animate-pulse rounded-md bg-muted/60" />
                  <div className="h-28 animate-pulse rounded-md bg-muted/60" />
                  <div className="h-28 animate-pulse rounded-md bg-muted/60" />
                </div>
                <div className="h-64 animate-pulse rounded-md bg-muted/50" />
              </div>
            ) : !currentProject && !departmentRoute ? (
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
              <div key={departmentRoute ? pathname : currentProject?.id}>
                <Outlet />
              </div>
            )}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
