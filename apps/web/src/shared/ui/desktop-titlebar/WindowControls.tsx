import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { Minus, Square, X } from "lucide-react";

export function WindowControls() {
  const [error, setError] = useState<string | null>(null);
  async function perform(action: "minimize" | "maximize" | "close") {
    setError(null);
    try {
      if (action === "close") {
        // Existing Rust CloseRequested -> React flush -> graceful sidecar exit.
        await invoke("request_desktop_close");
      } else if (action === "minimize") {
        await getCurrentWindow().minimize();
      } else {
        await getCurrentWindow().toggleMaximize();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <div className="desktop-window-controls" role="group" aria-label="Window controls">
      {error && <span className="desktop-window-error" role="alert">{error}</span>}
      <button type="button" aria-label="Minimize window" title="Minimize" onClick={() => void perform("minimize")}><Minus size={13} /></button>
      <button type="button" aria-label="Maximize or restore window" title="Maximize or restore" onClick={() => void perform("maximize")}><Square size={12} /></button>
      <button type="button" className="desktop-window-close" aria-label="Close window" title="Close" onClick={() => void perform("close")}><X size={14} /></button>
    </div>
  );
}
