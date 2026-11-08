import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { Copy, Minus, Square, X } from "lucide-react";

type WindowAction = "minimize" | "maximize" | "close";
type CloseState = "idle" | "flushing" | "error";

const CLOSE_STATUS_EVENT = "notespace:close-status";

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}

export function WindowControls() {
  const [maximized, setMaximized] = useState(false);
  const [pendingAction, setPendingAction] = useState<WindowAction | null>(null);
  const [closeState, setCloseState] = useState<CloseState>("idle");
  const [error, setError] = useState<string | null>(null);
  const busy = pendingAction !== null || closeState === "flushing";

  useEffect(() => {
    const currentWindow = getCurrentWindow();
    let mounted = true;
    let unlistenResize: (() => void) | undefined;

    const syncMaximized = () => {
      void currentWindow.isMaximized()
        .then((value) => { if (mounted) setMaximized(value); })
        .catch((cause) => { if (mounted) setError(errorMessage(cause)); });
    };

    syncMaximized();
    void currentWindow.onResized(syncMaximized)
      .then((unlisten) => {
        if (mounted) unlistenResize = unlisten;
        else unlisten();
      })
      .catch((cause) => { if (mounted) setError(errorMessage(cause)); });

    const onCloseStatus = (event: Event) => {
      const detail = (event as CustomEvent<{ state?: CloseState; message?: string }>).detail;
      if (!detail?.state) return;
      setCloseState(detail.state);
      if (detail.state === "error") setError(detail.message ?? "The window could not close safely. Try again.");
      else setError(null);
    };
    window.addEventListener(CLOSE_STATUS_EVENT, onCloseStatus);

    return () => {
      mounted = false;
      unlistenResize?.();
      window.removeEventListener(CLOSE_STATUS_EVENT, onCloseStatus);
    };
  }, []);

  async function perform(action: WindowAction) {
    if (busy) return;
    setError(null);
    setPendingAction(action);
    const currentWindow = getCurrentWindow();
    try {
      if (action === "close") {
        setCloseState("flushing");
        // Existing Rust CloseRequested -> React flush -> graceful sidecar exit.
        await invoke("request_desktop_close");
      } else if (action === "minimize") {
        await currentWindow.minimize();
      } else {
        await currentWindow.toggleMaximize();
        setMaximized(await currentWindow.isMaximized());
      }
    } catch (cause) {
      if (action === "close") setCloseState("error");
      setError(errorMessage(cause));
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="desktop-window-controls" role="group" aria-label="Window controls" aria-busy={busy}>
      {error && <span className="desktop-window-error" role="alert">{error}</span>}
      <button type="button" aria-label="Minimize window" title="Minimize" disabled={busy} onClick={() => void perform("minimize")}><Minus size={13} /></button>
      <button type="button" aria-label={maximized ? "Restore window" : "Maximize window"} title={maximized ? "Restore" : "Maximize"} disabled={busy} onClick={() => void perform("maximize")}>
        {maximized ? <Copy size={12} /> : <Square size={12} />}
      </button>
      <button type="button" className="desktop-window-close" aria-label="Close window" title={closeState === "flushing" ? "Saving changes" : "Close"} disabled={busy} onClick={() => void perform("close")}><X size={14} /></button>
    </div>
  );
}
