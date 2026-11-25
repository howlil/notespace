import { useEffect } from "react";
import {
  allowDesktopClose,
  beginDesktopQuiescence,
  cancelDesktopClose,
  flushDesktopState,
  isTauriRuntime,
  sealDesktopWrites,
} from "../../runtime/durability-barrier";
import { useStore } from "../../../shared/lib/use-store";
import { desktopCloseStore, setDesktopCloseStatus } from "../desktop-store";

export function DesktopCloseBridge() {
  const { state: closeState, message: closeError } = useStore(desktopCloseStore);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    // Native Rust ingress for close status updates from the Tauri shell.
    const onCloseStatus = (event: Event) => {
      const detail = (event as CustomEvent<{ state?: string; message?: string }>).detail;
      if (!detail) return;
      if (detail.state === "error") {
        setDesktopCloseStatus("error", detail.message ?? "Changes could not be saved. Try closing again.");
      } else if (detail.state === "idle") {
        setDesktopCloseStatus("idle", null);
      }
    };
    const requestClose = () => {
      setDesktopCloseStatus("flushing", null);
      let release: (() => void) | null = null;
      try {
        release = beginDesktopQuiescence();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Another save operation is already in progress.";
        setDesktopCloseStatus("error", message);
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
          const message = error instanceof Error ? error.message : "Changes could not be saved. Try closing again.";
          setDesktopCloseStatus("error", message);
          try {
            await cancelDesktopClose();
          } catch (cancelError) {
            console.error("Notespace close cancellation failed", cancelError);
          }
        });
    };
    window.addEventListener("notespace:close-requested", requestClose);
    window.addEventListener("notespace:close-status", onCloseStatus);
    return () => {
      window.removeEventListener("notespace:close-requested", requestClose);
      window.removeEventListener("notespace:close-status", onCloseStatus);
    };
  }, []);

  if (closeState === "idle") return null;
  const failed = closeState === "error";
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[var(--z-toast)] flex justify-center p-3" data-testid="desktop-close-status" data-desktop-close-state={closeState}>
      <div className={`rounded-md border bg-surface px-3 py-2 text-xs ${failed ? "border-danger/40 text-danger" : "border-line text-muted"}`} role={failed ? "alert" : "status"} aria-live={failed ? "assertive" : "polite"}>
        {failed ? closeError ?? "Changes could not be saved. Try closing again." : "Saving changes before closing…"}
      </div>
    </div>
  );
}
