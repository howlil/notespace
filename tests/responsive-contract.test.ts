import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const WEB_SRC = join(ROOT, "apps", "web", "src");
const WORKSPACE = join(WEB_SRC, "features", "workspace", "Workspace.tsx");
const DASHBOARD = join(WEB_SRC, "features", "dashboard", "Dashboard.tsx");
const SIDEBAR = join(WEB_SRC, "components", "layout", "Sidebar.tsx");
const STUDY = join(WEB_SRC, "features", "study", "StudyActivityDashboard.tsx");
const CATEGORY = join(WEB_SRC, "features", "category", "CategoryDetail.tsx");
const DIALOG = join(WEB_SRC, "components", "ui", "dialog.tsx");
const GLOBALS = join(WEB_SRC, "styles", "globals.css");
const CANVAS_CHROME = join(WEB_SRC, "integrations", "canvas", "CanvasChrome.tsx");

function source(path: string) { return readFileSync(path, "utf8"); }

test("responsive contract: compact workspaces preserve usable pane width", () => {
  const workspace = source(WORKSPACE);
  assert.match(workspace, /matchMedia\("\(max-width: 760px\)"\)/);
  assert.match(workspace, /node\.direction === "row" && compactPanes \? "column" : node\.direction/);
  assert.match(workspace, /max-\[760px\]:!grid-cols-1/);
  assert.doesNotMatch(workspace, /keepsCanvasOnRight/);
  assert.doesNotMatch(workspace, /max-\[760px\]:h-\[calc\(100dvh/);
});

test("responsive contract: mobile library uses an app bar and off-canvas navigation", () => {
  const dashboard = source(DASHBOARD);
  const sidebar = source(SIDEBAR);
  assert.match(dashboard, /mobileLibraryOpen/);
  assert.match(dashboard, /aria-label="Open library navigation"/);
  assert.match(dashboard, /max-\[560px\]:fixed/);
  assert.match(dashboard, /max-\[560px\]:w-\[min\(320px,86vw\)\]/);
  assert.match(dashboard, /max-\[560px\]:-translate-x-full/);
  assert.match(dashboard, /overflow-x-auto overscroll-x-contain/);
  assert.doesNotMatch(dashboard, /<Brand\s*\/>/);
  assert.match(sidebar, /max-\[560px\]:relative/);
  assert.match(sidebar, /max-\[560px\]:max-h-\[190px\]/);
  assert.ok(dashboard.indexOf("<StudyActivityDashboard />") > dashboard.indexOf("<section className=\"min-w-0 overflow-hidden rounded-lg border border-line bg-surface\""));
});

test("responsive contract: mobile learning activity is summary-first", () => {
  const study = source(STUDY);
  assert.match(study, /mobileExpanded/);
  assert.match(study, /View heatmap/);
  assert.match(study, /Hide heatmap/);
  assert.match(study, /max-\[560px\]:hidden/);
});

test("responsive contract: canvas chrome is compact, distinct, and touch-safe", () => {
  const globals = source(GLOBALS);
  const chrome = source(CANVAS_CHROME);
  assert.match(globals, /@media \(max-width: 560px\)/);
  assert.match(globals, /\.main-menu-trigger/);
  assert.match(globals, /\[data-testid="main-menu-trigger"\]/);
  assert.match(globals, /\.undo-redo-buttons/);
  assert.match(globals, /\.notespace-selection-actions button\[aria-label="Undo"\]/);
  assert.match(globals, /\.notespace-selection-actions button\[aria-label="Redo"\]/);
  assert.match(globals, /:has\(> \[aria-label="Canvas tools"\]\)/);
  assert.match(globals, /bottom: 8px !important/);
  assert.match(globals, /\.notespace-selection-actions[\s\S]*bottom: 60px !important/);
  assert.match(globals, /\[aria-label="Canvas tools"\] button[\s\S]*width: 40px !important/);
  assert.match(chrome, /function NativeToolIcon/);
  assert.match(chrome, /case "arrow"/);
  assert.match(chrome, /case "line"/);
  assert.match(chrome, /event\.pointerType === "mouse"/);
  assert.match(chrome, /aria-label="More canvas view controls"/);
  assert.match(chrome, /keepSelection: false/);
});

test("responsive contract: narrow category controls can shrink and reflow", () => {
  const category = source(CATEGORY);
  assert.match(category, /max-\[520px\]:px-4/);
  assert.match(category, /max-\[520px\]:w-auto max-\[520px\]:flex-1/);
  assert.match(category, /flex flex-wrap items-center justify-center/);
  assert.match(category, /overflow-x-hidden/);
});

test("responsive contract: shared dialogs stay inside viewport and above mobile navigation", () => {
  const dialog = source(DIALOG);
  assert.match(dialog, /max-h-\[calc\(100dvh_-_24px\)\]/);
  assert.match(dialog, /overflow-y-auto overscroll-contain/);
  assert.match(dialog, /max-\[480px\]:w-\[calc\(100vw_-_24px\)\]/);
  assert.match(dialog, /max-\[420px\]:flex-col-reverse/);
  assert.match(dialog, /z-\[110\]/);
  assert.match(dialog, /z-\[120\]/);
});