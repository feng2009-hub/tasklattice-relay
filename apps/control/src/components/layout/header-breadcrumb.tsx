import { Fragment } from "react";
import { useProject } from "@/hooks/use-project";
import { cn } from "@/lib/utils";

const routeLabels: Record<string, string> = {
  "access-policies": "Access Policies",
  "agent-garden": "Agent Garden",
  "audit-logs": "Audit Logs",
  cost: "Cost",
  instances: "Runtime Instances",
  "knowledge-base": "Knowledge Base",
  memory: "Memory",
  "mcp-servers": "MCP Servers",
  notifications: "Notifications",
  profile: "Account",
  requests: "Requests",
  "requests/new": "Raise Request",
  runtime: "OpenShell Runtime",
  "runtime-policies": "Runtime Policies",
  setting: "Project Settings",
  "setting/model-routings": "Routing",
  skills: "Skills",
  traces: "Traces",
};

const detailLabels: Record<string, string> = {
  "access-policies": "Policy details",
  "agent-garden": "Agent details",
  instances: "Instance details",
  "setting/model-routings": "Routing details",
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
  const projectId = parts[0];
  const routeParts = parts.slice(1);
  return routeParts.map((part, routeIndex) => {
    const index = routeIndex + 1;
    const routeKey = routeParts.slice(0, routeIndex + 1).join("/");
    const parentKey = routeParts.slice(0, routeIndex).join("/");
    const label = routeLabels[routeKey]
      ?? detailLabels[parentKey]
      ?? decodePathPart(part);
    return {
      href: `/${[projectId, ...parts.slice(1, index + 1)].join("/")}`,
      label,
    };
  });
}

export function HeaderBreadcrumb({ pathname }: { pathname: string }) {
  const { currentProject: currentProject } = useProject();
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
