import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  Boxes,
  ChevronRight,
  CircleDollarSign,
  CircleHelp,
  FileLock2,
  FilePlus2,
  Gauge,
  LayoutDashboard,
  ListChecks,
  Network,
  Search,
  ServerCog,
  Settings,
  ShieldEllipsis,
  Sparkles,
  Route as RouteIcon,
  type LucideIcon,
} from "lucide-react";
import type { AuthUser } from "@/components/auth/auth-provider";
import { useAuth } from "@/components/auth/auth-provider";
import { AccountMenu } from "@/components/account/account-menu";
import { BrandLogo } from "@/components/brand/brand-logo";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type WorkspaceRoute =
  | "/providers"
  | "/providers/cost"
  | "/providers/inference-groups"
  | "/dashboard"
  | "/instances"
  | "/requests/new"
  | "/agent/sandboxes/runtime"
  | "/agent/sandboxes/policy"
  | "/knowledge"
  | "/mcp"
  | "/Extensions/skill"
  | "/tickets";

type RuntimeState = {
  label: string;
  tone: "danger" | "neutral" | "success" | "warning";
};

type NavStatusKey = "openShellRuntime";

type NavChildDefinition = {
  description: string;
  icon: LucideIcon;
  label: string;
  statusKey?: NavStatusKey;
  to: WorkspaceRoute;
};

type NavItemDefinition = {
  children?: NavChildDefinition[];
  collapsible?: boolean;
  icon: LucideIcon;
  label: string;
  statusKey?: NavStatusKey;
  to: WorkspaceRoute;
};

const navGroups: Array<{ items: NavItemDefinition[]; label: string }> = [
  {
    label: "Overview",
    items: [{ icon: LayoutDashboard, label: "Workspace", to: "/dashboard" }],
  },
  {
    label: "Provider",
    items: [
      { icon: Gauge, label: "Registry", to: "/providers" },
      { icon: RouteIcon, label: "Inference Groups", to: "/providers/inference-groups" },
      { icon: CircleDollarSign, label: "Cost", to: "/providers/cost" },
    ],
  },
  {
    label: "Agent",
    items: [
      { icon: Boxes, label: "Instances", to: "/instances" },
      {
        children: [
          {
            description: "Sandbox execution layer",
            icon: ShieldEllipsis,
            label: "OpenShell runtime",
            statusKey: "openShellRuntime",
            to: "/agent/sandboxes/runtime",
          },
          {
            description: "OpenShell access rules",
            icon: FileLock2,
            label: "Policy",
            to: "/agent/sandboxes/policy",
          },
        ],
        collapsible: true,
        icon: ShieldEllipsis,
        label: "Sandboxes",
        statusKey: "openShellRuntime",
        to: "/agent/sandboxes/runtime",
      },
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
  providers: "Providers",
  "inference-groups": "Inference Groups",
  requests: "Requests",
  runtime: "Runtime",
  sandboxes: "Sandboxes",
  skill: "Skills",
  skills: "Skills",
  tickets: "Ticket List",
};

function itemIsActive(item: NavItemDefinition, pathname: string) {
  if (item.to === "/instances") return pathname === "/instances" || pathname.startsWith("/agents");
  return pathname === item.to || Boolean(item.children?.some((child) => pathname === child.to));
}

function RuntimeStatus({ compact = false, state }: { compact?: boolean; state: RuntimeState }) {
  const toneClass = cn(
    state.tone === "success" && "bg-emerald-500",
    state.tone === "warning" && "bg-amber-500",
    state.tone === "danger" && "bg-destructive",
    state.tone === "neutral" && "bg-muted-foreground/50",
  );
  if (compact) {
    return <span aria-hidden="true" className={cn("absolute -bottom-1 -right-1 size-2 rounded-full ring-2 ring-sidebar", toneClass)} />;
  }
  return (
    <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 font-normal text-muted-foreground">
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", toneClass)} />
      {state.label}
    </span>
  );
}

function NavIcon({ active, icon: Icon, runtimeState }: { active: boolean; icon: LucideIcon; runtimeState?: RuntimeState }) {
  return (
    <span className="relative shrink-0">
      <Icon className={cn(active && "text-primary")} />
      {runtimeState ? <RuntimeStatus compact state={runtimeState} /> : null}
    </span>
  );
}

function NavChildren({ children, pathname, runtimeStates }: {
  children: NavChildDefinition[];
  pathname: string;
  runtimeStates: Record<NavStatusKey, RuntimeState>;
}) {
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarMenuSub>
      {children.map((child) => {
        const active = pathname === child.to;
        const runtimeState = child.statusKey ? runtimeStates[child.statusKey] : undefined;
        return (
          <SidebarMenuSubItem key={child.to}>
            <SidebarMenuSubButton asChild isActive={active}>
              <Link to={child.to} onClick={() => setOpenMobile(false)} aria-current={active ? "page" : undefined}>
                <child.icon className={cn(active && "text-primary")} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <strong className="truncate font-medium">{child.label}</strong>
                    {runtimeState ? <RuntimeStatus state={runtimeState} /> : null}
                  </span>
                  <span className="mt-0.5 block truncate text-muted-foreground">{child.description}</span>
                </span>
              </Link>
            </SidebarMenuSubButton>
          </SidebarMenuSubItem>
        );
      })}
    </SidebarMenuSub>
  );
}

function NavigationItem({ item, pathname, runtimeStates }: {
  item: NavItemDefinition;
  pathname: string;
  runtimeStates: Record<NavStatusKey, RuntimeState>;
}) {
  const { setOpenMobile } = useSidebar();
  const active = itemIsActive(item, pathname);
  const runtimeState = item.statusKey ? runtimeStates[item.statusKey] : undefined;
  const [open, setOpen] = useState(active);

  useEffect(() => {
    if (active && item.collapsible) setOpen(true);
  }, [active, item.collapsible, pathname]);

  if (item.collapsible && item.children) {
    return (
      <Collapsible asChild open={open} onOpenChange={setOpen} className="group/collapsible">
        <SidebarMenuItem>
          <CollapsibleTrigger asChild>
            <SidebarMenuButton type="button" isActive={active} tooltip={item.label} aria-expanded={open}>
              <NavIcon active={active} icon={item.icon} {...(runtimeState ? { runtimeState } : {})} />
              <span>{item.label}</span>
              <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
            </SidebarMenuButton>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <NavChildren children={item.children} pathname={pathname} runtimeStates={runtimeStates} />
          </CollapsibleContent>
        </SidebarMenuItem>
      </Collapsible>
    );
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
        <Link to={item.to} onClick={() => setOpenMobile(false)} aria-current={pathname === item.to ? "page" : undefined}>
          <NavIcon active={active} icon={item.icon} {...(runtimeState ? { runtimeState } : {})} />
          <span>{item.label}</span>
          {runtimeState ? <span className="sr-only">OpenShell runtime: {runtimeState.label}</span> : null}
        </Link>
      </SidebarMenuButton>
      {item.children ? <NavChildren children={item.children} pathname={pathname} runtimeStates={runtimeStates} /> : null}
    </SidebarMenuItem>
  );
}

function DisabledNav({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton disabled tooltip="Not part of the current Agent operating path.">
        <Icon />
        <span>{label}</span>
        <span className="ml-auto bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide group-data-[collapsible=icon]:hidden">Later</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function WorkspaceSidebar({ logout, pathname, runtimeStates, user }: {
  logout: () => void | Promise<void>;
  pathname: string;
  runtimeStates: Record<NavStatusKey, RuntimeState>;
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
        <nav aria-label="Workspace navigation" className="flex flex-col py-2">
          {navGroups.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <NavigationItem key={item.to} item={item} pathname={pathname} runtimeStates={runtimeStates} />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </nav>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-3">
        <SidebarMenu>
          <DisabledNav icon={Settings} label="Platform settings" />
          <DisabledNav icon={CircleHelp} label="Help & documentation" />
        </SidebarMenu>
        <div className="mt-1 border-t border-sidebar-border pt-3">
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
      <Link to="/dashboard" className="hover:text-foreground">Workspace</Link>
      {labels.filter((label) => label && label !== "Overview").map((label) => (
        <span key={label} className="flex items-center gap-2"><span aria-hidden="true">/</span><span className="font-medium text-foreground">{label}</span></span>
      ))}
    </nav>
  );
}

export function AppShell() {
  const { logout, user } = useAuth();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const runtime = useQuery({
    queryKey: ["runtime-status"],
    queryFn: api.getRuntimeStatus,
    retry: 1,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
  const openShellRuntime: RuntimeState = runtime.isPending
    ? { label: "Checking", tone: "neutral" }
    : runtime.data?.terminal.available && runtime.data.terminal.transport === "openshell"
      ? { label: "Connected", tone: "success" }
      : runtime.error
        ? { label: "Unavailable", tone: "danger" }
        : { label: "Unavailable", tone: "warning" };

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
          runtimeStates={{ openShellRuntime }}
          user={user}
        />
        <SidebarInset>
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/94 px-4 backdrop-blur-md sm:px-6 lg:px-8">
            <SidebarTrigger />
            <Breadcrumbs pathname={pathname} />
            <button disabled className="ml-auto hidden min-h-10 w-64 cursor-not-allowed items-center gap-2 border bg-muted/30 px-3 text-sm text-muted-foreground/45 md:flex"><Search className="size-4" />Search workspace<span className="ml-auto text-[10px] uppercase">Later</span></button>
            <div className="ml-auto flex min-h-10 items-center gap-2 rounded-full border px-3 text-xs font-semibold md:ml-2"><span className="size-2 rounded-full bg-[#79a93b]" />UAT</div>
          </header>
          <main id="main-content" className="mx-auto w-full max-w-[1440px] p-5 sm:p-6 lg:p-8"><Outlet /></main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
