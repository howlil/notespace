import { DesktopCloseBridge } from "../features/desktop";
import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import { MotionConfig } from "motion/react";
import { type ReactNode } from "react";
import globalStyles from "../shared/styles/globals.css?inline";
import workspaceAuthoringStyles from "../features/workspace-authoring/workspace-authoring.css?inline";
import desktopTitlebarStyles from "../features/desktop/chrome/desktop-titlebar.css?inline";
import { Button } from "../shared/ui";
import { ThemeProvider } from "../shared/ui/theme/theme-provider";
import { ToastProvider } from "../shared/ui/feedback/toast-provider";
import { NativePopupManager } from "../shared/ui/overlays/dismissable";
import { QuickOpen } from "../features/search";
import { LibraryTools } from "../features/library";
import { DesktopUpdateControl } from "../features/desktop";
import { DesktopChromeProvider } from "../features/desktop";
import { LibraryExplorerProvider } from "../features/library";
import { AppSettings } from "../features/settings";
import { DesktopRecoveryTools } from "../features/desktop";
import { RoutePending } from "../pages/shell/RoutePending";

const routeMessageClass = "flex min-h-dvh flex-col items-center justify-center gap-5 p-8 text-center";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Notespace — Write. Draw. Understand." },
    ],
    links: [
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "preconnect", href: "https://storage.googleapis.com" },
      { rel: "dns-prefetch", href: "//storage.googleapis.com" },
    ],
    // Keep app styles in TanStack's managed head so they survive client head reconciliation.
    styles: [
      { children: globalStyles },
      { children: workspaceAuthoringStyles },
      { children: desktopTitlebarStyles },
    ],
  }),
  shellComponent: RootDocument,
  component: RootApplication,
  notFoundComponent: () => (
    <main className={routeMessageClass}>
      <h1 className="m-0 text-2xl font-medium tracking-tight text-ink">Workspace not found</h1>
      <Link className="text-accent hover:underline" to="/">Back to library</Link>
    </main>
  ),
  errorComponent: ({ error, reset }) => (
    <main className={routeMessageClass}>
      <h1 className="m-0 text-2xl font-medium tracking-tight text-ink">Unable to open Notespace</h1>
      <p className="m-0 max-w-xl text-sm text-muted">{error.message}</p>
      <Button onClick={reset}>Try again</Button>
      <a className="text-accent hover:underline" href="/">Back to library</a>
    </main>
  ),
});

function RootApplication() {
  const initialRoutePending = useRouterState({
    select: (state) => state.status === "pending" && state.resolvedLocation === undefined,
  });

  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.16, ease: "easeOut" }}>
      <NativePopupManager>
        <ToastProvider>
          <ThemeProvider>
              <DesktopCloseBridge />
              <DesktopUpdateControl />
              <AppSettings
                renderLibraryTools={(onBusyChange, disabled, deviceRecovery) => <LibraryTools onBusyChange={onBusyChange} disabled={disabled} deviceRecovery={deviceRecovery} />}
                renderDesktopRecovery={(onBusyChange) => <DesktopRecoveryTools onBusyChange={onBusyChange} />}
              />
              <QuickOpen />
              {initialRoutePending && <RoutePending />}
              <LibraryExplorerProvider><DesktopChromeProvider><Outlet /></DesktopChromeProvider></LibraryExplorerProvider>
          </ThemeProvider>
        </ToastProvider>
      </NativePopupManager>
    </MotionConfig>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
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
