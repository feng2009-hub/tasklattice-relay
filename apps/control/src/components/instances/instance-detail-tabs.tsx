import type { KeyboardEvent } from "react";
import { Link } from "@tanstack/react-router";
import type { InstanceDetailTab } from "./instance-detail-model";
import { instanceDetailTabs } from "./instance-detail-model";
import { cn } from "@/lib/utils";

const labels: Record<InstanceDetailTab, string> = {
  overview: "Overview",
  configuration: "Configuration",
  capabilities: "Capabilities",
  runtime: "Runtime",
  activity: "Activity",
};

export function InstanceTabs({ active, agentId }: { active: InstanceDetailTab; agentId: string }) {
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]'));
    const current = tabs.indexOf(document.activeElement as HTMLElement);
    if (current < 0) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next]?.focus();
  };

  return (
    <nav aria-label="Instance detail sections" className="-mx-1 overflow-x-auto border-b" onKeyDown={handleKeyDown}>
      <div role="tablist" className="flex min-w-max px-1">
        {instanceDetailTabs.map((tab) => (
          <Link
            key={tab}
            role="tab"
            aria-selected={active === tab}
            tabIndex={active === tab ? 0 : -1}
            to="/agents/$agentId"
            params={{ agentId }}
            search={{ tab }}
            className={cn("relative flex min-h-12 items-center px-4 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40", active === tab && "font-medium text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-primary")}
          >
            {labels[tab]}
          </Link>
        ))}
      </div>
    </nav>
  );
}
