import { useRouterState } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { HeaderBreadcrumb } from "@/components/layout/header-breadcrumb";
import { SidebarTrigger } from "@/components/ui/sidebar";

export function WorkspaceHeader({ showSidebarTrigger = true }: {
  showSidebarTrigger?: boolean;
}) {
  const { t } = useTranslation("sidebar");
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <div className="sticky top-0 z-30 bg-background/94 backdrop-blur-md">
      <header className="flex h-16 items-center gap-3 border-b px-4 sm:px-6 lg:px-8">
        {showSidebarTrigger ? (
          <SidebarTrigger label={t("navigation.toggle")} />
        ) : null}
        <HeaderBreadcrumb pathname={pathname} />
        <button
          disabled
          className="ml-auto hidden h-9 w-64 cursor-not-allowed items-center gap-2 rounded-md border border-border/70 bg-muted/30 px-3 text-sm text-muted-foreground/45 md:flex"
        >
          <Search className="size-3.5" />
          {t("search.label")}
          <span className="ml-auto text-[10px] uppercase">{t("search.planned")}</span>
        </button>
      </header>
    </div>
  );
}
