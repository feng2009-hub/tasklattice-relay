import type { QueryClient } from "@tanstack/react-query";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  retainSearchParams,
  useRouterState,
} from "@tanstack/react-router";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AuthProvider } from "@/components/auth/auth-provider";
import { AppShell } from "@/components/layout/app-shell";
import { WorkspaceProvider } from "@/components/workspace/workspace-provider";
import appCss from "../styles.css?url";

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  component: RootApplication,
  search: {
    middlewares: [retainSearchParams(["workspace"])],
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      { title: "TaskLattice" },
      {
        name: "description",
        content: "Schedule and operate isolated agents on Kubernetes.",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
    ],
  }),
  shellComponent: RootDocument,
});

function RootApplication() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isPublic =
    pathname === "/" || pathname === "/login" || pathname === "/auth/sso-complete";
  return (
    <AuthProvider>
      {isPublic ? (
        <Outlet />
      ) : (
        <AuthGuard>
          <WorkspaceProvider>
            <AppShell />
          </WorkspaceProvider>
        </AuthGuard>
      )}
    </AuthProvider>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
