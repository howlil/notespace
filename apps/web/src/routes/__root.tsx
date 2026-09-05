import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import "../styles/globals.css";
import { Button } from "../components/ui";
import { ThemeProvider } from "../providers/theme-provider";
import { ToastProvider } from "../providers/toast-provider";
import { NativePopupManager } from "../components/ui/dismissable";
import { QuickCapture } from "../features/capture/QuickCapture";

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
    ],
  }),
  shellComponent: RootDocument,
  component: () => (
    <NativePopupManager>
      <ToastProvider>
        <ThemeProvider>
          <Outlet />
          <QuickCapture />
        </ThemeProvider>
      </ToastProvider>
    </NativePopupManager>
  ),
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
