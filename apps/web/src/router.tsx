import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({
    routeTree,
    // Hover preloads are frequently aborted while developing. TanStack Start's
    // Vite SSR adapter can leave an aborted stream behind until its 120s
    // watchdog fires, which crashes the dev process. Production keeps the
    // faster intent preloads because the built SPA does not use dev SSR.
    defaultPreload: import.meta.env.DEV ? false : "intent",
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
