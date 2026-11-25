import { createContext, useContext } from "react";
import type { DesktopPlatform } from "./desktop-platform";

type DesktopChromeContextValue = {
  customChromeActive: boolean;
  platform: DesktopPlatform;
};

export const DesktopChromeContext = createContext<DesktopChromeContextValue>({
  customChromeActive: false,
  platform: "windows",
});

export const useDesktopChrome = () => useContext(DesktopChromeContext);
