import { Fragment } from "react";
import { Link } from "@tanstack/react-router";
import { WorkspaceSwitcher } from "@/components/workspace/workspace-switcher";
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
  runtime: "Runtime",
  sandboxes: "Sandboxes",
  settings: "Settings",
  skill: "Skills",
  skills: "Skills",
  tickets: "Ticket List",
  workspaces: "Workspaces",
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
  const items = getHeaderBreadcrumbItems(pathname);
  const lastIndex = items.length - 1;

  return (
    <div className="flex min-w-0 items-center gap-1 text-xs">
      <WorkspaceSwitcher />
      {items.length ? (
        <>
          <span aria-hidden="true" className="shrink-0 text-muted-foreground/70">
            /
          </span>
          <nav
            aria-label="Breadcrumb"
            className="flex min-w-0 items-center gap-1 text-muted-foreground"
          >
            {items.map((item, index) => {
              const current = index === lastIndex;
              return (
                <Fragment key={item.href}>
                  {index > 0 ? (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "shrink-0 text-muted-foreground/70",
                        index <= lastIndex && "hidden md:inline",
                      )}
                    >
                      /
                    </span>
                  ) : null}
                  {current ? (
                    <span
                      aria-current="page"
                      className="min-w-0 truncate font-medium text-foreground"
                      title={item.label}
                    >
                      {item.label}
                    </span>
                  ) : (
                    <Link
                      to={item.href as never}
                      className="hidden shrink-0 rounded-sm px-1 py-1 outline-none transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/35 md:inline"
                    >
                      {item.label}
                    </Link>
                  )}
                </Fragment>
              );
            })}
          </nav>
        </>
      ) : null}
    </div>
  );
}
