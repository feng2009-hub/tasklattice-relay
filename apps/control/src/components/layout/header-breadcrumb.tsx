import { Fragment } from "react";
import { useWorkspace } from "@/hooks/use-workspace";
import { cn } from "@/lib/utils";

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
  security: "Security",
  runtime: "Runtime",
  sandboxes: "Sandboxes",
  settings: "Settings",
  skill: "Skills",
  skills: "Skills",
  tickets: "Ticket List",
  "virtual-employees": "Virtual Employees",
  workspaces: "Projects",
};

export interface HeaderBreadcrumbItem {
  href: string;
  label: string;
}

function decodePathPart(part: string) {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

export function getHeaderBreadcrumbItems(pathname: string): HeaderBreadcrumbItem[] {
  const parts = pathname.split("/").filter(Boolean);
  return parts.flatMap((part, index) => {
    if (index === 1 && parts[0] === "agents" && part === "instace") return [];
    const label =
      index === 2 && parts[0] === "security" && parts[1] === "virtual-employees"
        ? "Details"
        :
      index === 1 && parts[0] === "requests" && part === "new"
        ? "Raise Request"
        : routeLabels[part] ?? decodePathPart(part);
    return [{
      href: `/${parts.slice(0, index + 1).join("/")}`,
      label,
    }];
  });
}

export function HeaderBreadcrumb({ pathname }: { pathname: string }) {
  const { currentWorkspace: currentProject } = useWorkspace();
  const items = getHeaderBreadcrumbItems(pathname);
  const lastIndex = items.length - 1;

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground"
    >
      <span
        className="max-w-36 shrink-0 truncate font-medium text-foreground sm:max-w-48"
        title={currentProject?.name}
      >
        {currentProject?.name ?? "Project"}
      </span>
      {items.map((item, index) => {
        const current = index === lastIndex;
        return (
          <Fragment key={item.href}>
            <span
              aria-hidden="true"
              className={cn(
                "shrink-0 text-muted-foreground/70",
                !current && "hidden md:inline",
              )}
            >
              /
            </span>
            <span
              aria-current={current ? "page" : undefined}
              className={cn(
                "shrink-0",
                current
                  ? "min-w-0 truncate font-medium text-foreground"
                  : "hidden md:inline",
              )}
              title={item.label}
            >
              {item.label}
            </span>
          </Fragment>
        );
      })}
    </nav>
  );
}
