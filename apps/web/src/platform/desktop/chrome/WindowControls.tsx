import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { Copy, Minus, Square, X } from "lucide-react";
import { useStore } from "../../../shared/lib/use-store";
import { desktopCloseStore, setDesktopCloseStatus } from "../desktop-store";
import type { DesktopPlatform } from "./desktop-platform";

type WindowAction = "minimize" | "maximize" | "close";

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}

export function WindowControls({
  variant = "windows",
  focused = true,
}: {
  variant?: DesktopPlatform;
  focused?: boolean;
}) {
  const [maximized, setMaximized] = useState(false);
  const [pendingAction, setPendingAction] = useState<WindowAction | null>(null);
  const { state: closeState, message: closeError } = useStore(desktopCloseStore);
  const [actionError, setActionError] = useState<string | null>(null);
  const error = closeState === "error"
    ? (closeError ?? "The window could not close safely. Try again.")
    : actionError;
  const busy = pendingAction !== null || closeState === "flushing";

  useEffect(() => {
    const currentWindow = getCurrentWindow();
    let mounted = true;
    let unlistenResize: (() => void) | undefined;

    const syncMaximized = () => {
      void currentWindow.isMaximized()
        .then((value) => { if (mounted) setMaximized(value); })
        .catch(() => {});
    };

    syncMaximized();
    window.addEventListener("resize", syncMaximized);
    void currentWindow.onResized(syncMaximized)
      .then((unlisten) => {
        if (mounted) unlistenResize = unlisten;
        else unlisten();
      })
      .catch(() => {});

    return () => {
      mounted = false;
      unlistenResize?.();
      window.removeEventListener("resize", syncMaximized);
    };
  }, []);

  async function perform(action: WindowAction) {
    if (busy) return;
    setActionError(null);
    setPendingAction(action);
    const currentWindow = getCurrentWindow();
    try {
      if (action === "close") {
        setDesktopCloseStatus("flushing", null);
        // Existing Rust CloseRequested -> React flush -> graceful sidecar exit.
        await invoke("request_desktop_close");
      } else if (action === "minimize") {
        await currentWindow.minimize();
      } else {
        await currentWindow.toggleMaximize();
        setMaximized(await currentWindow.isMaximized());
      }
    } catch (cause) {
      const message = errorMessage(cause);
      if (action === "close") setDesktopCloseStatus("error", message);
      else setActionError(message);
    } finally {
      setPendingAction(null);
    }
  }

  if (variant === "macos") {
    return (
      <div
        className={[
          "desktop-window-controls",
          "desktop-window-controls--macos",
          !focused && "desktop-window-controls--unfocused",
        ].filter(Boolean).join(" ")}
        role="group"
        aria-label="Window controls"
        aria-busy={busy}
      >
        {error && <span className="desktop-window-error" role="alert">{error}</span>}
        <button
          type="button"
          className="desktop-tl desktop-tl--close"
          aria-label="Close window"
          title={closeState === "flushing" ? "Saving changes" : "Close"}
          disabled={busy}
          onClick={() => void perform("close")}
        >
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
            <path d="M3.2 3.2l5.6 5.6M8.8 3.2l-5.6 5.6" />
          </svg>
        </button>
        <button
          type="button"
          className="desktop-tl desktop-tl--min"
          aria-label="Minimize window"
          title="Minimize"
          disabled={busy}
          onClick={() => void perform("minimize")}
        >
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
            <path d="M2.5 6h7" />
          </svg>
        </button>
        <button
          type="button"
          className="desktop-tl desktop-tl--max"
          aria-label={maximized ? "Restore window" : "Maximize window"}
          title={maximized ? "Restore" : "Maximize"}
          disabled={busy}
          onClick={() => void perform("maximize")}
        >
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 7.5V3h4.5M9 4.5V9H4.5" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div
      className={[
        "desktop-window-controls",
        "desktop-window-controls--windows",
        !focused && "desktop-window-controls--unfocused",
      ].filter(Boolean).join(" ")}
      role="group"
      aria-label="Window controls"
      aria-busy={busy}
    >
      {error && <span className="desktop-window-error" role="alert">{error}</span>}
      <button type="button" aria-label="Minimize window" title="Minimize" disabled={busy} onClick={() => void perform("minimize")}><Minus size={13} /></button>
      <button type="button" aria-label={maximized ? "Restore window" : "Maximize window"} title={maximized ? "Restore" : "Maximize"} disabled={busy} onClick={() => void perform("maximize")}>
        {maximized ? <Copy size={12} /> : <Square size={12} />}
      </button>
      <button type="button" className="desktop-window-close" aria-label="Close window" title={closeState === "flushing" ? "Saving changes" : "Close"} disabled={busy} onClick={() => void perform("close")}><X size={14} /></button>
    </div>
  );
}
