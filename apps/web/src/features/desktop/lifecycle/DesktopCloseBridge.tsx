import { useEffect, useState } from "react";
import { allowDesktopClose, beginDesktopQuiescence, cancelDesktopClose, flushDesktopState, isTauriRuntime, sealDesktopWrites } from "../../../adapters/desktop/desktop-lifecycle";

export function DesktopCloseBridge() {
  const [closeState, setCloseState] = useState<"idle" | "flushing" | "error">("idle");
  const [closeError, setCloseError] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    const requestClose = () => {
      setCloseState("flushing");
      setCloseError(null);
      window.dispatchEvent(new CustomEvent("notespace:close-status", { detail: { state: "flushing" } }));
      let release: (() => void) | null = null;
      try {
        release = beginDesktopQuiescence();
      } catch (error) {
        setCloseState("error");
        const message = error instanceof Error ? error.message : "Another save operation is already in progress.";
        setCloseError(message);
        window.dispatchEvent(new CustomEvent("notespace:close-status", { detail: { state: "error", message } }));
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
          const message = error instanceof Error ? error.message : "Changes could not be saved. Try closing again.";
          setCloseError(message);
          window.dispatchEvent(new CustomEvent("notespace:close-status", { detail: { state: "error", message } }));
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
        {failed ? closeError ?? "Changes could not be saved. Try closing again." : "Saving changes before closing…"}
      </div>
    </div>
  );
}
