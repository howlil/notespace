import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { MotionConfig } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import "../shared/styles/globals.css";
import "../features/workspace-authoring/workspace-authoring.css";
import { Button } from "../shared/ui";
import { ThemeProvider } from "../shared/ui/theme-provider";
import { ToastProvider } from "../shared/ui/toast-provider";
import { NativePopupManager } from "../shared/ui/dismissable";
import { QuickOpen } from "../features/search/QuickOpen";
import { DesktopUpdateControl } from "../features/desktop-updates/DesktopUpdateControl";
import { DesktopRecoveryTools } from "../features/desktop-recovery/DesktopRecoveryTools";
import { ConflictRecoveryDialog } from "../features/workspace-authoring/ui/ConflictRecoveryDialog";
import { ActivityRuntimeProvider } from "../features/activity/activity-runtime-provider";
import { ActivityDock } from "../features/activity/ActivityDock";
import { allowDesktopClose, beginDesktopQuiescence, cancelDesktopClose, flushDesktopState, isTauriRuntime, sealDesktopWrites } from "../adapters/browser/desktop-lifecycle";

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
  }),
  shellComponent: RootDocument,
  component: () => (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.16, ease: "easeOut" }}>
      <NativePopupManager>
        <ToastProvider>
          <ThemeProvider>
            <ActivityRuntimeProvider>
              <DesktopCloseBridge />
              <DesktopUpdateControl />
              <DesktopRecoveryTools />
              <QuickOpen />
              <ConflictRecoveryDialog />
              <Outlet />
              <ActivityDock />
            </ActivityRuntimeProvider>
          </ThemeProvider>
        </ToastProvider>
      </NativePopupManager>
    </MotionConfig>
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

function DesktopCloseBridge() {
  const [closeState, setCloseState] = useState<"idle" | "flushing" | "error">("idle");
  const [closeError, setCloseError] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    const requestClose = () => {
      setCloseState("flushing");
      setCloseError(null);
      let release: (() => void) | null = null;
      try {
        release = beginDesktopQuiescence();
      } catch (error) {
        setCloseState("error");
        setCloseError(error instanceof Error ? error.message : "Penyimpanan lain masih berjalan.");
        void cancelDesktopClose().catch(() => {});
        return;
      }
      void flushDesktopState()
        .then(async () => {
          sealDesktopWrites();
          await allowDesktopClose();
        })
        .catch(async (error) => {
          release?.();
          console.error("Notespace close flush failed", error);
          setCloseState("error");
          setCloseError(error instanceof Error ? error.message : "Perubahan belum tersimpan. Coba tutup lagi.");
          try {
            await cancelDesktopClose();
          } catch (cancelError) {
            console.error("Notespace close cancellation failed", cancelError);
          }
        });
    };
    window.addEventListener("notespace:close-requested", requestClose);
    return () => window.removeEventListener("notespace:close-requested", requestClose);
  }, []);
  if (closeState === "idle") return null;
  const failed = closeState === "error";
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex justify-center p-3" data-testid="desktop-close-status" data-desktop-close-state={closeState}>
      <div className={`rounded-md border bg-surface px-3 py-2 text-xs shadow-sm ${failed ? "border-danger/40 text-danger" : "border-line text-muted"}`} role={failed ? "alert" : "status"} aria-live={failed ? "assertive" : "polite"}>
        {failed ? closeError ?? "Perubahan belum tersimpan. Coba tutup lagi." : "Menyimpan perubahan sebelum menutup…"}
      </div>
    </div>
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
