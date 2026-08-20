import { Fragment } from "react";
import { useProject } from "@/hooks/use-project";
import { usePlatformLanguage } from "@/hooks/use-platform-language";
import { cn } from "@/lib/utils";
import type { AccountLanguage } from "@/services/personal-profile";

const routeLabels: Record<string, string> = {
  "access-policies": "Access Policies",
  "agent-garden": "Agent Garden",
  "audit-logs": "Audit Logs",
  cost: "Cost",
  help: "Help & documentation",
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

export function getHeaderBreadcrumbItems(
  pathname: string,
  language: AccountLanguage = "en-US",
): HeaderBreadcrumbItem[] {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "departments" && parts[1]) {
    return [{ href: pathname, label: "Department settings" }];
  }
  const projectId = parts[0];
  const routeParts = parts.slice(1);
  return routeParts.map((part, routeIndex) => {
    const index = routeIndex + 1;
    const routeKey = routeParts.slice(0, routeIndex + 1).join("/");
    const parentKey = routeParts.slice(0, routeIndex).join("/");
    const label = routeKey === "help" && language === "zh-CN"
      ? "帮助与文档"
      : routeLabels[routeKey]
      ?? detailLabels[parentKey]
      ?? decodePathPart(part);
    return {
      href: `/${[projectId, ...parts.slice(1, index + 1)].join("/")}`,
      label,
    };
  });
}

export function HeaderBreadcrumb({ pathname }: { pathname: string }) {
  const { currentProject } = useProject();
  const language = usePlatformLanguage();
  const items = getHeaderBreadcrumbItems(pathname, language);
  const lastIndex = items.length - 1;
  const departmentRoute = pathname.startsWith("/departments/");
  const departmentId = pathname.split("/").filter(Boolean)[1];
  const rootTitle = departmentRoute
    ? currentProject?.department.id === departmentId
      ? currentProject?.department.name ?? departmentId ?? "Department"
      : departmentId ?? "Department"
    : currentProject?.name ?? "Project";

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground"
    >
      <span
        className="max-w-36 shrink-0 truncate font-medium text-foreground sm:max-w-48"
        title={rootTitle}
      >
        {rootTitle}
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
