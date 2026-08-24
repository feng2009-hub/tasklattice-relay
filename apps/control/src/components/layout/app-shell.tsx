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
  ServerCog,
  Settings2,
  ShieldCheck,
  Sparkles,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
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
import { WorkspaceHeader } from "@/components/layout/workspace-header";
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
  labelKey:
    | "instances"
    | "memory"
    | "specialistAgents"
    | "skills"
    | "mcpConnections"
    | "knowledgeSources"
    | "accessPolicies"
    | "runtimePolicies"
    | "traces"
    | "auditLogs"
    | "cost";
  to: ProjectRoute;
};

type NavGroupDefinition = {
  items: NavItemDefinition[];
  labelKey: "home" | "capabilityToolbox" | "governance" | "evidence";
};

export const navGroups: NavGroupDefinition[] = [
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

export function itemIsActive(item: NavItemDefinition, pathname: string, projectId: string) {
  const target = item.to.replace("$projectId", encodeURIComponent(projectId));
  const normalizedPathname = pathname.replace(/\/$/, "");
  const normalizedTarget = target.replace(/\/$/, "");
  if (normalizedPathname === normalizedTarget) return true;
  return normalizedPathname.startsWith(`${normalizedTarget}/`);
}

export function routeUsesFullBleedLayout(pathname: string): boolean {
  const normalizedPathname = pathname.replace(/\/$/, "");
  return normalizedPathname === "/platform/settings"
    || /^\/[^/]+\/help$/.test(normalizedPathname);
}

function NavigationItem({ item, pathname, projectId }: {
  item: NavItemDefinition;
  pathname: string;
  projectId: string;
}) {
  const { setOpenMobile } = useSidebar();
  const { t } = useTranslation("sidebar");
  const active = itemIsActive(item, pathname, projectId);
  const label = t(`navigation.items.${item.labelKey}`);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={label}>
        <Link
          to={item.to}
          params={{ projectId }}
          onClick={() => setOpenMobile(false)}
          aria-current={active ? "page" : undefined}
          aria-label={label}
        >
          <item.icon className={cn(active && "text-primary")} />
          <span>{label}</span>
        </Link>
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
  const { t } = useTranslation("sidebar");
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
  const platformSettingsActive = pathname.replace(/\/$/, "") === "/platform/settings";
  return (
    <ToastProvider duration={3_000} swipeDirection="right">
      <Sidebar
        collapsible="icon"
        mobileDescription={t("navigation.description")}
        mobileTitle={t("navigation.title")}
      >
        <SidebarHeader className="gap-1.5 border-b border-sidebar-border p-2">
          <Link to="/$projectId" params={{ projectId }} onClick={() => setOpenMobile(false)} className="flex min-h-11 min-w-0 items-center gap-3 px-2 focus-visible:outline-2 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-11 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0" aria-label={t("brandHome")}>
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
            onProjectSettingsOpen={() => setOpenMobile(false)}
          />
        </SidebarHeader>
        <SidebarContent>
          <nav aria-label={t("navigation.title")} className="flex flex-col py-1">
            {currentProject ? navGroups.map((group) => (
              <SidebarGroup key={group.labelKey}>
                <SidebarGroupLabel>
                  {t(`navigation.groups.${group.labelKey}`)}
                </SidebarGroupLabel>
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
          {user?.systemRole === "platform_administrator" ? (
            <SidebarMenu className="border-b border-sidebar-border pb-2">
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={platformSettingsActive}
                  tooltip={t("platformSetting")}
                >
                  <Link
                    to="/platform/settings"
                    onClick={() => setOpenMobile(false)}
                    aria-current={platformSettingsActive ? "page" : undefined}
                    aria-label={t("platformSetting")}
                  >
                    <Settings2 />
                    <span>{t("platformSetting")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          ) : null}
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={helpActive}
                tooltip={t("help.label")}
              >
                <Link
                  to="/$projectId/help"
                  params={{ projectId }}
                  onClick={() => setOpenMobile(false)}
                  aria-current={helpActive ? "page" : undefined}
                  aria-label={t("help.label")}
                >
                  <CircleHelp />
                  <span>{t("help.label")}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
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
        <SidebarRail label={t("navigation.toggle")} />
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
            <ToastTitle>{t("switchToast.title")}</ToastTitle>
            <ToastDescription>
              <strong className="block font-medium text-foreground">
                {toastProject}
              </strong>
              {t("switchToast.description")}
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
  const { t } = useTranslation(["sidebar", "common"]);
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
  const platformRoute = pathname.startsWith("/platform/");
  const departmentRoute = pathname.startsWith("/departments/");
  const globalRoute = departmentRoute || platformRoute;
  const fullBleedRoute = routeUsesFullBleedLayout(pathname);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [nestedSidebarOpen, setNestedSidebarOpen] = useState(false);

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

  useEffect(() => {
    if (fullBleedRoute) setNestedSidebarOpen(false);
  }, [fullBleedRoute, pathname]);

  const handleSidebarOpenChange = (open: boolean) => {
    if (fullBleedRoute) {
      setNestedSidebarOpen(open);
      return;
    }
    setSidebarOpen(open);
    window.localStorage.setItem("tali.sidebar.collapsed", String(!open));
  };

  const activeSidebarOpen = fullBleedRoute ? nestedSidebarOpen : sidebarOpen;

  return (
    <TooltipProvider delayDuration={250}>
      <SidebarProvider open={activeSidebarOpen} onOpenChange={handleSidebarOpenChange}>
        <ProjectSidebar
          createProjectOpen={createProjectOpen}
          logout={logout}
          onCreateProjectOpenChange={setCreateProjectOpen}
          pathname={pathname}
          user={user}
        />
        <SidebarInset>
          {!fullBleedRoute ? <WorkspaceHeader /> : null}
          <main
            id="main-content"
            className={cn(
              "w-full",
              fullBleedRoute ? "flex-1" : "mx-auto p-5 sm:p-6 lg:py-6",
              !fullBleedRoute && (sidebarOpen ? "max-w-[1600px]" : "max-w-none"),
            )}
          >
            {!globalRoute && projectError ? (
              <div role="status" className="mb-5 border-l-2 border-amber-500 bg-amber-500/5 px-4 py-3 text-sm text-amber-900">
                {projectError}
              </div>
            ) : null}
            {!globalRoute && projectLoading ? (
              <div className="space-y-6" aria-label={t("projectEmptyState.loading")}>
                <div className="h-20 animate-pulse rounded-md bg-muted/70" />
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="h-28 animate-pulse rounded-md bg-muted/60" />
                  <div className="h-28 animate-pulse rounded-md bg-muted/60" />
                  <div className="h-28 animate-pulse rounded-md bg-muted/60" />
                </div>
                <div className="h-64 animate-pulse rounded-md bg-muted/50" />
              </div>
            ) : !currentProject && !globalRoute ? (
              <section className="mx-auto max-w-md py-20 text-center" aria-labelledby="no-project-title">
                <h1 id="no-project-title" className="text-lg font-semibold">
                  {t("projectEmptyState.title")}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("projectEmptyState.description")}
                </p>
                <div className="mt-5 flex justify-center gap-3">
                  <Button onClick={() => setCreateProjectOpen(true)}>
                    {t("projectEmptyState.create")}
                  </Button>
                  <Button variant="outline" onClick={() => void refreshProjects()}>
                    {t("common:actions.reload")}
                  </Button>
                </div>
              </section>
            ) : (
              <div
                key={globalRoute ? pathname : currentProject?.id}
                className={cn(fullBleedRoute && "min-h-full")}
              >
                <Outlet />
              </div>
            )}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
