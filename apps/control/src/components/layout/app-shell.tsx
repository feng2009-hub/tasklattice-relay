import { useEffect, useState } from "react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  Boxes,
  CircleDollarSign,
  CircleHelp,
  FileLock2,
  FilePlus2,
  LayoutDashboard,
  ListChecks,
  Network,
  Search,
  ServerCog,
  Settings,
  Sparkles,
  SlidersHorizontal,
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
import { WorkspaceSwitcher } from "@/components/workspace/workspace-switcher";
import { useWorkspace } from "@/hooks/use-workspace";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type WorkspaceRoute =
  | "/providers"
  | "/providers/cost"
  | "/providers/model-profiles"
  | "/dashboard"
  | "/instances"
  | "/requests/new"
  | "/agent/sandboxes/policy"
  | "/knowledge"
  | "/mcp"
  | "/Extensions/skill"
  | "/tickets";

type NavItemDefinition = {
  icon: LucideIcon;
  label: string;
  to: WorkspaceRoute;
};

const navGroups: Array<{ items: NavItemDefinition[]; label: string }> = [
  {
    label: "Overview",
    items: [{ icon: LayoutDashboard, label: "Workspace", to: "/dashboard" }],
  },
  {
    label: "Models",
    items: [
      { icon: SlidersHorizontal, label: "Model Profiles", to: "/providers/model-profiles" },
      { icon: CircleDollarSign, label: "Cost", to: "/providers/cost" },
    ],
  },
  {
    label: "Agent",
    items: [
      { icon: Boxes, label: "Instances", to: "/instances" },
      { icon: FileLock2, label: "Policy", to: "/agent/sandboxes/policy" },
    ],
  },
  {
    label: "Extensions",
    items: [
      { icon: Sparkles, label: "Skills", to: "/Extensions/skill" },
      { icon: ServerCog, label: "MCP Servers", to: "/mcp" },
      { icon: Network, label: "Knowledge Base", to: "/knowledge" },
    ],
  },
  {
    label: "Approval",
    items: [
      { icon: FilePlus2, label: "Raise Request", to: "/requests/new" },
      { icon: ListChecks, label: "Ticket List", to: "/tickets" },
    ],
  },
];

const routeLabels: Record<string, string> = {
  Extensions: "Extensions",
  agent: "Agent",
  agents: "Instances",
  cost: "Cost",
  dashboard: "Overview",
  instances: "Instances",
  instace: "Instances",
  knowledge: "Knowledge Base",
  mcp: "MCP Servers",
  new: "Create Instance",
  policy: "Policy",
  providers: "Models",
  "model-profiles": "Model Profiles",
  requests: "Requests",
  runtime: "Runtime",
  sandboxes: "Sandboxes",
  settings: "Settings",
  skill: "Skills",
  skills: "Skills",
  tickets: "Ticket List",
  workspaces: "Workspaces",
};

function itemIsActive(item: NavItemDefinition, pathname: string) {
  if (item.to === "/instances") return pathname === "/instances" || pathname.startsWith("/agents");
  if (item.to === "/providers/model-profiles") return pathname.startsWith("/providers/model-profiles");
  return pathname === item.to;
}

function NavigationItem({ item, pathname }: {
  item: NavItemDefinition;
  pathname: string;
}) {
  const { setOpenMobile } = useSidebar();
  const active = itemIsActive(item, pathname);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
        <Link
          to={item.to}
          onClick={() => setOpenMobile(false)}
          aria-current={pathname === item.to ? "page" : undefined}
          aria-label={item.label}
        >
          <item.icon className={cn(active && "text-primary")} />
          <span>{item.label}</span>
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

function WorkspaceSidebar({ logout, pathname, user }: {
  logout: () => void | Promise<void>;
  pathname: string;
  user: AuthUser | null;
}) {
  const { isMobile, setOpenMobile, state } = useSidebar();
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-16 justify-center border-b border-sidebar-border px-4 group-data-[collapsible=icon]:px-2">
        <Link to="/dashboard" onClick={() => setOpenMobile(false)} className="flex min-h-11 min-w-0 items-center gap-3 focus-visible:outline-2" aria-label="TaskLattice workspace">
          <BrandLogo compact={!isMobile && state === "collapsed"} />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Workspace navigation" className="flex flex-col py-1">
          {navGroups.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <NavigationItem key={item.to} item={item} pathname={pathname} />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </nav>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-2">
        <SidebarMenu>
          <DisabledNav icon={Settings} label="Platform settings" />
          <DisabledNav icon={CircleHelp} label="Help & documentation" />
        </SidebarMenu>
        <div className="mt-1 border-t border-sidebar-border pt-2">
          <AccountMenu collapsed={!isMobile && state === "collapsed"} onLogout={logout} user={user} />
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function Breadcrumbs({ pathname }: { pathname: string }) {
  const parts = pathname.split("/").filter(Boolean);
  const labels = parts.map((part, index) => {
    if (index === 1 && parts[0] === "agents" && part === "instace") return "";
    if (index === 1 && parts[0] === "agents" && part !== "new") return "Agent detail";
    if (index === 1 && parts[0] === "requests" && part === "new") return "Raise Request";
    return routeLabels[part] ?? part;
  });
  return (
    <nav aria-label="Breadcrumb" className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
      {labels.filter((label) => label && label !== "Overview").map((label, index) => (
        <span key={label} className="flex items-center gap-2">{index > 0 ? <span aria-hidden="true">/</span> : null}<span className="font-medium text-foreground">{label}</span></span>
      ))}
    </nav>
  );
}

export function AppShell() {
  const { logout, user } = useAuth();
  const { currentWorkspace, error: workspaceError, loading: workspaceLoading } = useWorkspace();
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
        <WorkspaceSidebar
          logout={logout}
          pathname={pathname}
          user={user}
        />
        <SidebarInset>
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/94 px-4 backdrop-blur-md sm:px-6 lg:px-8">
            <SidebarTrigger />
            <WorkspaceSwitcher />
            <Breadcrumbs pathname={pathname} />
            <button disabled className="ml-auto hidden h-9 w-64 cursor-not-allowed items-center gap-2 rounded-md border border-border/70 bg-muted/30 px-3 text-sm text-muted-foreground/45 md:flex"><Search className="size-3.5" />Search workspace<span className="ml-auto text-[10px] uppercase">Later</span></button>
            <div className="ml-auto flex min-h-10 items-center gap-2 rounded-full border px-3 text-xs font-semibold md:ml-2"><span className="size-2 rounded-full bg-[#79a93b]" />UAT</div>
          </header>
          <main id="main-content" className="mx-auto w-full max-w-[1320px] p-5 sm:p-6 lg:px-8 lg:py-6">
            {workspaceError ? (
              <div role="status" className="mb-5 border-l-2 border-amber-500 bg-amber-500/5 px-4 py-3 text-sm text-amber-900">
                {workspaceError}
              </div>
            ) : null}
            {workspaceLoading || !currentWorkspace ? (
              <div className="space-y-6" aria-label="Loading workspace data">
                <div className="h-20 animate-pulse rounded-md bg-muted/70" />
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="h-28 animate-pulse rounded-md bg-muted/60" />
                  <div className="h-28 animate-pulse rounded-md bg-muted/60" />
                  <div className="h-28 animate-pulse rounded-md bg-muted/60" />
                </div>
                <div className="h-64 animate-pulse rounded-md bg-muted/50" />
              </div>
            ) : (
              <div key={currentWorkspace.id}>
                <Outlet />
              </div>
            )}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
