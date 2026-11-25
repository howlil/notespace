import { Outlet, useRouterState } from "@tanstack/react-router";
import { MotionConfig } from "motion/react";
import { useEffect } from "react";
import { ThemeProvider } from "../shared/ui/theme/theme-provider";
import { ToastProvider } from "../shared/ui/feedback/toast-provider";
import { useStore } from "../shared/lib/use-store";
import {
  DesktopChromeProvider,
  DesktopCloseBridge,
  DesktopRecoveryTools,
  DesktopUpdateControl,
} from "../platform/desktop";
import { LibraryExplorerProvider, LibraryTools } from "../modules/library";
import { QuickOpen } from "./command-palette";
import { AppSettings } from "./settings";
import { RoutePending } from "./shell/RoutePending";
import { PersistentAppShell } from "./shell/PersistentAppShell";
import { appShellStore } from "./shell/app-shell-store";

export function AppRoot() {
  const initialRoutePending = useRouterState({
    select: (state) => state.status === "pending" && state.resolvedLocation === undefined,
  });
  const canvasFullMode = useStore(appShellStore, (state) => state.canvasFullMode);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (canvasFullMode) document.documentElement.dataset.canvasFullMode = "true";
    else delete document.documentElement.dataset.canvasFullMode;
  }, [canvasFullMode]);

  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.16, ease: "easeOut" }}>
      <ToastProvider>
        <ThemeProvider>
          <DesktopCloseBridge />
          <DesktopUpdateControl />
          <AppSettings
            renderLibraryTools={(onBusyChange, disabled, deviceRecovery) => (
              <LibraryTools onBusyChange={onBusyChange} disabled={disabled} deviceRecovery={deviceRecovery} />
            )}
            renderDesktopRecovery={(onBusyChange) => (
              <DesktopRecoveryTools onBusyChange={onBusyChange} />
            )}
          />
          <QuickOpen />
          {initialRoutePending && <RoutePending />}
          <LibraryExplorerProvider>
            <DesktopChromeProvider>
              <PersistentAppShell>
                <Outlet />
              </PersistentAppShell>
            </DesktopChromeProvider>
          </LibraryExplorerProvider>
        </ThemeProvider>
      </ToastProvider>
    </MotionConfig>
  );
}
