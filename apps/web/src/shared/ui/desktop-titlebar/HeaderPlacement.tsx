import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type DesktopChromeContextValue = {
  customChromeActive: boolean;
  headerHost: HTMLElement | null;
};

export const DesktopChromeContext = createContext<DesktopChromeContextValue>({
  customChromeActive: false,
  headerHost: null,
});

export const useDesktopChrome = () => useContext(DesktopChromeContext);

// Keep header children under the owning page's React state/context. Only its
// presentation container moves into the desktop shell; Web markup is identical.
export function HeaderPlacement({ children, className }: { children: ReactNode; className?: string }) {
  const { customChromeActive, headerHost } = useDesktopChrome();
  const header = <header data-tauri-drag-region={customChromeActive ? "" : undefined} className={customChromeActive ? (className || "") + " desktop-placed-header" : className}>{children}</header>;
  return customChromeActive && headerHost ? createPortal(header, headerHost) : header;
}
