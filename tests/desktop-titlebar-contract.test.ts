import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(path, "utf8");
const web = "apps/web/src/";
const rust = source("apps/desktop/src-tauri/src/lib.rs");
const controls = source(web + "shared/ui/desktop-titlebar/WindowControls.tsx");
const title = source(web + "shared/ui/desktop-titlebar/DesktopTitleBar.tsx");
const header = source(web + "shared/ui/desktop-titlebar/HeaderPlacement.tsx");
const provider = source(web + "shared/ui/desktop-titlebar/DesktopChromeProvider.tsx");
const shell = source(web + "pages/_shared/LibraryPageShell.tsx");
const welcome = source(web + "pages/home/HomePage.tsx");
const workspace = source(web + "pages/workspace/WorkspacePage.tsx");

test("Welcome and Canvas share one titlebar and Explorer shell", () => {
  assert.match(header, /createPortal\(header, headerHost\)/);
  assert.match(header, /return customChromeActive && headerHost \? createPortal/);
  assert.match(welcome, /<LibraryPageShell/);
  assert.match(workspace, /<LibraryPageShell canvas/);
  assert.match(shell, /<HeaderPlacement/);
  assert.match(shell, /Hide Explorer/);
  assert.match(shell, /OPEN_QUICK_SEARCH_EVENT/);
  assert.doesNotMatch(workspace, /WorkspaceRail|WorkspaceGuide|ActivityIndicator/);
  assert.doesNotMatch(provider, /desktop-workspace-rail-slot|customChromeActive && isWorkspace/);
  assert.match(title, /NotespaceLogo/);
  assert.match(provider, /activate_desktop_titlebar/);
  assert.match(provider, /if \(!desktop\) return/);
});

test("Native close still requires durability handshake and native fallback", () => {
  assert.match(controls, /invoke\("request_desktop_close"\)/);
  assert.doesNotMatch(controls, /getCurrentWindow\(\)\.close\(\)|app\.exit/);
  assert.match(rust, /fn activate_desktop_titlebar\(/);
  assert.match(rust, /window\.set_decorations\(true\)/);
  assert.match(rust, /window\.set_decorations\(false\)/);
  assert.match(rust, /window\.dispatchEvent\(new Event\('notespace:close-requested'\)\)/);
});

test("The only theme controls are in Settings", () => {
  assert.match(source(web + "features/settings/AppSettings.tsx"), /Use \{dark \? "light" : "dark"\} theme/);
  assert.doesNotMatch(shell, /ThemeToggle/);
  assert.doesNotMatch(workspace, /ThemeToggle|WorkspaceGuide/);
});
