import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(path, "utf8");
const web = "apps/web/src/";
const rust = source("apps/desktop/src-tauri/src/window.rs");
const controls = source(web + "features/desktop/chrome/WindowControls.tsx");
const title = source(web + "features/desktop/chrome/DesktopTitleBar.tsx");
const header = source(web + "features/desktop/chrome/HeaderPlacement.tsx");
const provider = source(web + "features/desktop/chrome/DesktopChromeProvider.tsx");
const shell = source(web + "pages/shell/LibraryPageShell.tsx");
const welcome = source(web + "pages/home/HomePage.tsx");
const workspace = source(web + "pages/workspace/WorkspacePage.tsx");

test("Tauri assembly delegates runtime state and lifecycle to their modules", () => {
  const assembly = source("apps/desktop/src-tauri/src/lib.rs");
  assert.doesNotMatch(assembly, /struct RuntimeProcess|(?:async )?fn (?:start_runtime|stop_runtime|wait_for_readiness)\(/);
  assert.match(assembly, /mod runtime;/);
  assert.match(assembly, /mod window;/);
  assert.match(source("apps/desktop/src-tauri/src/runtime/state.rs"), /struct RuntimeProcess/);
  assert.match(source("apps/desktop/src-tauri/src/runtime/sidecar.rs"), /async fn start_runtime\(/);
  assert.match(source("apps/desktop/src-tauri/src/runtime/shutdown.rs"), /fn stop_runtime\(/);
});

test("Welcome and Canvas share one titlebar and Explorer shell", () => {
  assert.match(header, /createPortal\(header, headerHost\)/);
  assert.match(header, /return customChromeActive && headerHost \? createPortal/);
  assert.match(welcome, /<LibraryPageShell/);
  assert.match(workspace, /<LibraryPageShell canvas/);
  assert.match(shell, /<HeaderPlacement/);
  assert.match(shell, /Hide Explorer|Show Explorer/);
  assert.match(shell, /NotespaceLogo/);
  assert.match(shell, /OPEN_QUICK_SEARCH_EVENT/);
  assert.doesNotMatch(workspace, /WorkspaceRail|WorkspaceGuide|ActivityIndicator/);
  assert.doesNotMatch(provider, /desktop-workspace-rail-slot|customChromeActive && isWorkspace/);
  assert.match(title, /NotespaceLogo/);
  assert.match(provider, /activate_desktop_titlebar/);
  assert.match(provider, /useState\(false\)/);
  assert.match(provider, /setDesktop\(typeof window/);
  assert.match(provider, /if \(!desktop\) return/);
});

test("Native close still requires durability handshake and native fallback", () => {
  assert.match(controls, /invoke\("request_desktop_close"\)/);
  assert.doesNotMatch(controls, /getCurrentWindow\(\)\.close\(\)|app\.exit/);
  assert.match(controls, /isMaximized\(\)/);
  assert.match(controls, /onResized/);
  assert.match(controls, /Restore window/);
  assert.match(title, /onFocusChanged/);
  assert.match(title, /toggleMaximize/);
  assert.match(rust, /fn activate_desktop_titlebar\(/);
  assert.match(source("apps/desktop/src-tauri/src/recovery.rs"), /window\.set_decorations\(true\)/);
  assert.match(rust, /window\s*\.set_decorations\(false\)/);
  assert.match(rust, /window\.dispatchEvent\(new Event\('notespace:close-requested'\)\)/);
  assert.match(rust, /notespace:close-status/);
  assert.match(source(web + "features/desktop/lifecycle/DesktopCloseBridge.tsx"), /notespace:close-status/);
  assert.match(source(web + "routes/__root.tsx"), /<DesktopCloseBridge/);
});

test("The only theme controls are in Settings", () => {
  const settings = source(web + "features/settings/AppSettings.tsx");
  assert.match(settings, /role="switch"/);
  assert.match(settings, /aria-checked=\{dark\}/);
  assert.match(settings, /aria-labelledby="notespace-theme-label"/);
  assert.doesNotMatch(shell, /ThemeToggle/);
  assert.doesNotMatch(workspace, /ThemeToggle|WorkspaceGuide/);
});
