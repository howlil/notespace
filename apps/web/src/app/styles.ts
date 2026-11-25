import globalStyles from "../shared/styles/globals.css?inline";
import workspaceAuthoringStyles from "../modules/workspace/workspace-authoring.css?inline";
import desktopTitlebarStyles from "../platform/desktop/chrome/desktop-titlebar.css?inline";

export const APP_HEAD_STYLES = [
  { children: globalStyles },
  { children: workspaceAuthoringStyles },
  { children: desktopTitlebarStyles },
];
