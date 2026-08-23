import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { createPlatformI18n } from "@/i18n/create-i18n";
import { getInitialLanguage } from "@/i18n/initial-language";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const i18n = createPlatformI18n(getInitialLanguage());
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: 1, staleTime: 1_000 } },
  });
  const router = createRouter({
    routeTree,
    context: { i18n, queryClient },
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
  });
  setupRouterSsrQueryIntegration({ router, queryClient });
  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
