import type { CSSProperties, ReactNode } from "react";
import { WorkspaceHeader } from "@/components/layout/workspace-header";
import { Sidebar, SidebarInset } from "@/components/ui/sidebar";

interface ContextSidebarLayoutProps {
  children: ReactNode;
  mobileNavigation: ReactNode;
  sidebar: ReactNode;
  sidebarWidth?: string;
}

export function ContextSidebarLayout({
  children,
  mobileNavigation,
  sidebar,
  sidebarWidth = "16rem",
}: ContextSidebarLayoutProps) {
  return (
    <div
      className="flex min-h-svh w-full bg-background"
      style={{ "--sidebar-width": sidebarWidth } as CSSProperties}
    >
      <Sidebar
        collapsible="none"
        className="sticky top-0 hidden h-svh shrink-0 self-start border-r border-sidebar-border lg:flex"
      >
        {sidebar}
      </Sidebar>

      <SidebarInset className="min-h-svh">
        <WorkspaceHeader />
        <div className="border-b border-sidebar-border p-4 lg:hidden">
          {mobileNavigation}
        </div>
        {children}
      </SidebarInset>
    </div>
  );
}
