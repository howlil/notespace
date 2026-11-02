import { useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DesktopChromeContext } from "./HeaderPlacement";
import { DesktopTitleBar } from "./DesktopTitleBar";

export function DesktopChromeProvider({ children }: { children: ReactNode }) {
  const desktop = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  const [headerHost, setHeaderHost] = useState<HTMLElement | null>(null);
  const [customChromeActive, setCustomChromeActive] = useState(false);

  useEffect(() => {
    if (!desktop || !headerHost) return;
    let mounted = true;
    // A ready React shell is required before native decorations are removed.
    void invoke("activate_desktop_titlebar")
      .then(() => { if (mounted) setCustomChromeActive(true); })
      .catch((error) => {
        // Keep native decorations and existing per-page headers on failure.
        console.error("Notespace custom desktop title bar unavailable", error);
      });
    return () => { mounted = false; };
  }, [desktop, headerHost]);

  if (!desktop) return <>{children}</>;

  // Keep the Outlet under a stable parent when chrome activates or routes change.
  // Welcome and Canvas share one shell; no secondary rail host.
  return (
    <DesktopChromeContext.Provider value={{ customChromeActive, headerHost, workspaceRailHost: null }}>
      <div className={[
        "desktop-shell",
        customChromeActive ? "desktop-shell--custom" : "desktop-shell--native",
      ].filter(Boolean).join(" ")}>
        <div className="desktop-shell-content">
          <DesktopTitleBar headerHostRef={setHeaderHost} active={customChromeActive} />
          <div className="desktop-page-viewport">{children}</div>
        </div>
      </div>
    </DesktopChromeContext.Provider>
  );
}
