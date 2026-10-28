import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(path, "utf8");
const web = "apps/web/src/";
const rust = source("apps/desktop/src-tauri/src/lib.rs");
const windowControls = source(web + "shared/ui/desktop-titlebar/WindowControls.tsx");
const title = source(web + "shared/ui/desktop-titlebar/DesktopTitleBar.tsx");
const header = source(web + "shared/ui/desktop-titlebar/HeaderPlacement.tsx");
const provider = source(web + "shared/ui/desktop-titlebar/DesktopChromeProvider.tsx");
const workspace = source(web + "pages/workspace/WorkspacePage.tsx");
const stylesheet = source(web + "shared/ui/desktop-titlebar/desktop-titlebar.css");

test("desktop title bar preserves existing per-page React handlers and web header fallback", () => {
  assert.match(header, /createPortal\(header, headerHost\)/);
  assert.match(header, /return customChromeActive && headerHost \? createPortal/);
  const shell = source(web + "pages/_shared/LibraryPageShell.tsx");
  assert.match(shell, /<HeaderPlacement/);
  for (const page of ["home/HomePage.tsx", "inbox/InboxPage.tsx", "today/TodayPage.tsx"]) {
    assert.match(source(web + "pages/" + page), /<LibraryPageShell/);
  }
  assert.match(workspace, /<HeaderPlacement/);
  assert.match(workspace, /showBack=\{!customChromeActive\}/);
  assert.match(workspace, /<WorkspaceRail/);
  assert.match(provider, /if \(!desktop\) return/);
  assert.match(provider, /activate_desktop_titlebar/);
});

test("M1 Workspace uses a dedicated rail without duplicate titlebar controls", () => {
  assert.match(title, /!isWorkspace &&/);
  assert.match(title, /NotespaceLogo/);
  assert.match(workspace, /<WorkspaceRail/);
  assert.doesNotMatch(workspace, /WorkspaceGuide|SettingsTrigger|workspace-switcher|desktop-workspace-drag/);
});

test("native window close retains the durability handshake and recovery frame", () => {
  assert.match(windowControls, /invoke\("request_desktop_close"\)/);
  assert.doesNotMatch(windowControls, /getCurrentWindow\(\)\.close\(\)|app\.exit/);
  assert.match(rust, /fn activate_desktop_titlebar\(/);
  assert.match(rust, /window\.set_decorations\(true\)/);
  assert.match(rust, /window\.set_decorations\(false\)/);
  assert.match(rust, /window\.dispatchEvent\(new Event\('notespace:close-requested'\)\)/);
});

test("Theme controls only exist in Settings; desktop Workspace hides its Settings trigger", () => {
  for (const page of ["home/HomePage.tsx", "inbox/InboxPage.tsx", "today/TodayPage.tsx"]) {
    const content = source(web + "pages/" + page);
    assert.doesNotMatch(content, /<ThemeToggle/);
    assert.doesNotMatch(content, /ThemeToggle/);
  }
  assert.match(source(web + "features/settings/AppSettings.tsx"), /Use \{dark \? "light" : "dark"\} theme/);
  assert.doesNotMatch(workspace, /SettingsTrigger|WorkspaceGuide/);
});

test("M2 desktop Workspace rail occupies its own full-height shell column and native fallback stays safe", () => {
  assert.match(provider, /workspaceRailHost/);
  assert.match(provider, /desktop-workspace-rail-slot/);
  assert.match(provider, /desktop-shell-content/);
  assert.match(provider, /customChromeActive && isWorkspace/);
  assert.match(stylesheet, /grid-template-columns: 40px minmax\(0, 1fr\)/);
  assert.match(stylesheet, /\.desktop-shell--native \.desktop-shell-content \{ height: 100dvh; \}/);
  assert.match(stylesheet, /\.desktop-shell--workspace:has\(\.workspace-main\.is-focus-mode\)/);
  assert.match(source(web + "shared/ui/desktop-titlebar/HeaderPlacement.tsx"), /workspaceRailHost: HTMLElement \| null/);
  assert.match(workspace, /railHostActive \? createPortal\(rail, workspaceRailHost\) : rail/);
  assert.match(title, /data-tauri-drag-region/);
  assert.doesNotMatch(stylesheet, /\.desktop-placed-header\.workspace-header/);
});
