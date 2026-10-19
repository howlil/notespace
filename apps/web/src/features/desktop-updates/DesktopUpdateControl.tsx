import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { beginDesktopQuiescence, flushDesktopState, isTauriRuntime, sealDesktopWrites } from "../../adapters/browser/desktop-lifecycle";
import { installDesktopUpdateWith } from "./install-desktop-update";
import { REQUEST_DESKTOP_UPDATE_CHECK } from "./update-events";

type PreparedUpdate = { version: string; notes?: string | null };
type Phase = "idle" | "checking" | "ready" | "saving" | "installing" | "error" | "current";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Native-only lightweight update entry. No update/installation capability is
// exposed to ordinary browser Notespace deployments.
export function DesktopUpdateControl() {
  const [enabled, setEnabled] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [info, setInfo] = useState<PreparedUpdate | null>(null);
  const [error, setError] = useState("");
  const [userInitiated, setUserInitiated] = useState(false);
  const checkingRef = useRef(false);
  const installingRef = useRef(false);

  const check = useCallback(async (manual: boolean) => {
    if (manual) setUserInitiated(true);
    if (checkingRef.current || installingRef.current) return;
    checkingRef.current = true;
    setPhase("checking");
    setError("");
    try {
      const available = await invoke<PreparedUpdate | null>("prepare_desktop_update");
      if (!available) {
        setInfo(null);
        setPhase("current");
      } else {
        setInfo(available);
        setPhase("ready");
      }
    } catch (cause) {
      setError(errorText(cause));
      setPhase("error");
    } finally {
      checkingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let active = true;
    void invoke<boolean>("desktop_updater_enabled")
      .then((value) => { if (active) setEnabled(value); })
      .catch(() => { if (active) setEnabled(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // Check once at startup without showing an always-on floating control.
    void check(false);
    const onManualCheck = () => { void check(true); };
    window.addEventListener(REQUEST_DESKTOP_UPDATE_CHECK, onManualCheck);
    return () => window.removeEventListener(REQUEST_DESKTOP_UPDATE_CHECK, onManualCheck);
  }, [enabled, check]);

  if (!enabled) return null;

  async function install() {
    if (phase !== "ready") return;
    // An overlay shields the editor from additional input before the final
    // flush. The installer must never be invoked after a rejected save.
    installingRef.current = true;
    setPhase("saving");
    setError("");
    let release: (() => void) | null = null;
    try {
      // Input is frozen synchronously, before the first async flush begins.
      release = beginDesktopQuiescence();
      await installDesktopUpdateWith({
        flush: async () => {
          await flushDesktopState();
          sealDesktopWrites();
          setPhase("installing");
        },
        install: async () => {
          await invoke("install_prepared_desktop_update");
        },
      });
      // Keep the write seal active on success: Windows now owns app shutdown.
    } catch (cause) {
      release?.();
      installingRef.current = false;
      setError(`Update cancelled or failed: ${errorText(cause)}`);
      setInfo(null);
      setPhase("error");
    }
  }

  async function dismiss() {
    if (phase === "installing" || phase === "saving") return;
    await invoke("cancel_prepared_desktop_update").catch(() => {});
    setInfo(null);
    setError("");
    setUserInitiated(false);
    setPhase("idle");
  }

  const locked = phase === "saving" || phase === "installing";
  // Silent startup check: surface only an available update. Explicit checks
  // initiated from Settings also surface no-update and recoverable errors.
  if (phase === "idle" || (phase !== "ready" && !locked && !userInitiated)) return null;
  return (
    <>
      {locked && <div className="fixed inset-0 z-[190] bg-black/25" aria-hidden="true" />}
      <aside aria-label="Notespace updates" className={`fixed bottom-4 right-4 z-[191] w-[min(350px,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-3 text-sm text-ink shadow-md`}>
        <div className="flex items-center justify-between gap-3">
          <strong className="font-medium">Desktop updates</strong>
          {!locked && phase !== "idle" && (
            <button type="button" onClick={() => void dismiss()} className="rounded-full px-2 py-1 text-muted hover:bg-surface-hover" aria-label="Dismiss desktop update">×</button>
          )}
        </div>
        {phase === "checking" && <p role="status" className="mt-2 text-muted">Checking and verifying available update…</p>}
        {phase === "current" && <p role="status" className="mt-2 text-muted">Notespace is up to date.</p>}
        {phase === "error" && (
          <>
            <p role="alert" className="mt-2 text-danger">{error}</p>
            <button type="button" onClick={() => void check(true)} className="mt-2 rounded-full border border-line px-3 py-1.5">Retry</button>
          </>
        )}
        {phase === "ready" && info && (
          <>
            <p className="mt-2">Signed update <strong>{info.version}</strong> is ready.</p>
            {info.notes && <p className="mt-1 line-clamp-3 text-xs text-muted">{info.notes}</p>}
            {error && <p role="alert" className="mt-2 text-danger">{error}</p>}
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => void install()} className="rounded-full bg-ink px-3 py-1.5 text-surface">Save and install</button>
              <button type="button" onClick={() => void dismiss()} className="rounded-full border border-line px-3 py-1.5">Later</button>
            </div>
          </>
        )}
        {locked && <p role="status" className="mt-2 text-muted">{phase === "saving" ? "Saving changes before installation…" : "Installing verified update. Keep Notespace open."}</p>}
      </aside>
    </>
  );
}
