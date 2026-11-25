export { DesktopChromeProvider } from "./chrome/DesktopChromeProvider";
export { useDesktopChrome } from "./chrome/HeaderPlacement";
export type { DesktopPlatform } from "./chrome/desktop-platform";
export { DesktopCloseBridge } from "./lifecycle/DesktopCloseBridge";
export { DesktopRecoveryTools } from "./recovery/DesktopRecoveryTools";
export { DesktopUpdateControl } from "./updates/DesktopUpdateControl";
export {
  desktopCloseStore,
  requestDesktopUpdateCheck,
  setDesktopCloseStatus,
  type DesktopCloseSnapshot,
  type DesktopCloseState,
} from "./desktop-store";
