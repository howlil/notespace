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

test("desktop title bar preserves existing per-page React handlers and web header fallback", () => {
  assert.match(header, /createPortal\(header, headerHost\)/);
  assert.match(header, /return customChromeActive && headerHost \? createPortal/);
  for (const page of ["home/HomePage.tsx", "inbox/InboxPage.tsx", "today/TodayPage.tsx", "workspace/WorkspacePage.tsx"]) {
    assert.match(source(web + "pages/" + page), /<HeaderPlacement/);
  }
  assert.match(provider, /if \(!desktop\) return/);
  assert.match(provider, /activate_desktop_titlebar/);
});

test("workspace has no logo and suppresses Guide only when custom chrome is active", () => {
  assert.match(title, /!isWorkspace &&/);
  assert.match(title, /NotespaceLogo/);
  assert.match(workspace, /!customChromeActive && <WorkspaceGuide \/>/);
  assert.match(workspace, /compact=\{customChromeActive\}/);
});

test("native window close retains the durability handshake and recovery frame", () => {
  assert.match(windowControls, /invoke\("request_desktop_close"\)/);
  assert.doesNotMatch(windowControls, /getCurrentWindow\(\)\.close\(\)|app\.exit/);
  assert.match(rust, /fn activate_desktop_titlebar\(/);
  assert.match(rust, /window\.set_decorations\(true\)/);
  assert.match(rust, /window\.set_decorations\(false\)/);
  assert.match(rust, /window\.dispatchEvent\(new Event\('notespace:close-requested'\)\)/);
});
