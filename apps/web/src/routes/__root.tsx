import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import "../styles/globals.css";
import "../components/feedback/route-pending.css";
import { ThemeProvider } from "../providers/theme-provider";
import { ToastProvider } from "../providers/toast-provider";
import { NativePopupManager } from "../components/ui/dismissable";

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
        </ThemeProvider>
      </ToastProvider>
    </NativePopupManager>
  ),
  notFoundComponent: () => (
    <main className="route-message">
      <h1>Workspace not found</h1>
      <Link to="/">Back to library</Link>
    </main>
  ),
  errorComponent: ({ error, reset }) => (
    <main className="route-message">
      <h1>Unable to open Notespace</h1>
      <p>{error.message}</p>
      <button className="primary" onClick={reset}>
        Try again
      </button>
      <a href="/">Back to library</a>
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
