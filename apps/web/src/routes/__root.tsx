import {
  createRootRoute,
  HeadContent,
  Link,
  Scripts,
} from "@tanstack/react-router";
import { type ReactNode } from "react";
import { AppRoot } from "../app/AppRoot";
import { APP_HEAD_STYLES } from "../app/styles";
import { Button } from "../shared/ui";
import { THEME_INIT_SCRIPT } from "../shared/ui/theme/theme-model";

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
    styles: APP_HEAD_STYLES,
  }),
  shellComponent: RootDocument,
  component: AppRoot,
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
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
