import { useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DesktopChromeContext } from "./HeaderPlacement";
import { DesktopTitleBar } from "./DesktopTitleBar";
import { detectDesktopPlatform, type DesktopPlatform } from "./desktop-platform";

export function DesktopChromeProvider({ children }: { children: ReactNode }) {
  const [customChromeActive, setCustomChromeActive] = useState(false);
  // SSR and the first client render must agree (plain children). Detect the
  // Tauri runtime only after hydration: a synchronous check here makes the
  // server/client DOM diverge, React discards the server HTML on the failed
  // hydration, and the Vite-injected dev styles are lost with it.
  const [desktop, setDesktop] = useState(false);
  const [platform, setPlatform] = useState<DesktopPlatform>("windows");

  useEffect(() => {
    setDesktop(typeof window !== "undefined" && "__TAURI_INTERNALS__" in window);
    if (typeof navigator !== "undefined") {
      setPlatform(detectDesktopPlatform(navigator.userAgent, navigator.platform));
    }
  }, []);

  useEffect(() => {
    if (!desktop) return;
    let mounted = true;
    // A ready React shell is required before native decorations are removed.
    void invoke("activate_desktop_titlebar")
      .then(() => { if (mounted) setCustomChromeActive(true); })
      .catch((error) => {
        // Keep native decorations when frameless activation fails.
        console.error("Notespace custom desktop title bar unavailable", error);
      });
    return () => { mounted = false; };
  }, [desktop]);

  if (!desktop) return <>{children}</>;

  // Keep the Outlet under a stable parent when chrome activates or routes change.
  // Welcome and Canvas share one shell; no secondary rail host.
  return (
    <DesktopChromeContext.Provider value={{ customChromeActive, platform }}>
      <div
        className={[
          "desktop-shell",
          customChromeActive ? "desktop-shell--custom" : "desktop-shell--native",
        ].filter(Boolean).join(" ")}
        data-desktop-platform={customChromeActive ? platform : undefined}
      >
        <div className="desktop-shell-content">
          <DesktopTitleBar active={customChromeActive} platform={platform} />
          <div className="desktop-page-viewport">{children}</div>
        </div>
      </div>
    </DesktopChromeContext.Provider>
  );
}
