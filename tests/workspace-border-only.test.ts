import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const ws = read("apps/web/src/pages/workspace/WorkspacePage.tsx");
const authoring = read("apps/web/src/features/workspace-authoring/ui/WorkspaceAuthoring.tsx");
const canvas = read("apps/web/src/features/workspace-authoring/canvas/CanvasChrome.tsx");
const document = read("apps/web/src/features/workspace-authoring/document/DocumentEditor.tsx");
const popup = read("apps/web/src/features/workspace-authoring/ui/workspace-ui-classes.ts");
const stylesheet = read("apps/web/src/features/workspace-authoring/workspace-authoring.css");
const plan = read("apps/web/src/features/planning/WorkspacePlan.tsx");
const contract = read("DESIGN.md");

test("Workspace authoring is full-bleed and keeps its existing view switcher and save/plan flows", () => {
  assert.match(ws, /flex h-auto min-h-0 min-w-0 flex-1 overflow-hidden p-0/);
  assert.doesNotMatch(ws, /overflow-hidden p-3 max-\[760px\]:p-\[7px\]/);
  assert.match(ws, /<WorkspaceViewSwitcher/);
  assert.match(ws, /authoring\.selectView\(mode\)/);
  assert.match(ws, /<WorkspacePlan/);
  assert.match(ws, /authoring\.status\.state/);
  assert.match(ws, /<HeaderPlacement/);
});

test("split is border-only with 7px pointer area and keyboard-accessible bounded resize", () => {
  assert.match(authoring, / 7px /);
  assert.match(authoring, /after:w-px/);
  assert.match(authoring, /after:h-px/);
  assert.match(authoring, /after:bg-line/);
  assert.match(authoring, /role="separator"/);
  assert.match(authoring, /aria-orientation=/);
  assert.match(authoring, /aria-valuenow=/);
  assert.match(authoring, /setPointerCapture\(event\.pointerId\)/);
  assert.match(authoring, /resizeSplit\(node\.id, ratio \+ \.05\)/);
  assert.match(authoring, /onPointerDown=/);
  assert.match(authoring, /onKeyDown=/);
});

test("Canvas toolbar and view controls float over full-bleed Workspace", () => {
  assert.match(canvas, /Canvas tools".*onPointerDown/);
  assert.match(canvas, /Canvas view controls".*onPointerDown/);
  assert.match(canvas, /rounded-lg border border-line bg-surface p-1 shadow-none/);
  assert.match(canvas, /notespace-canvas-bottom-chrome.*absolute bottom-2 left-1\/2/);
  assert.match(canvas, /max-w-\[calc\(100vw-16px\)\]/);
  assert.match(canvas, /overflow-x-auto/);
  assert.match(canvas, /pointer-events-auto absolute top-2 right-2 z-20/);
  assert.match(stylesheet, /notespace-canvas-bottom-chrome\s*\{\s*bottom: calc\(8px \+ env\(safe-area-inset-bottom\)\) !important;\s*width: calc\(100% - 16px\);/);
});

test("Note actions, editor and Workspace menus use borders without decorative shadows", () => {
  assert.match(document, /toolbarTarget \? createPortal/);
  assert.match(document, /<EditorContent editor=\{editor\}/);
  assert.doesNotMatch(document, /shadow-\[(?:0_10px|0_12px)/);
  assert.doesNotMatch(document, /shadow-sm/);
  assert.match(popup, /border border-line bg-surface/);
  assert.match(popup, /shadow-none/);
  assert.match(authoring, /<DocumentEditor/);
  assert.match(authoring, /<CanvasEditor/);
});

test("Plan stays a separate outline with divider rows and existing API actions", () => {
  assert.match(plan, /border-b border-line px-1\.5 py-1 hover:bg-tint\/60/);
  assert.match(plan, /max-w-\[760px\]/);
  assert.match(plan, /createMilestone\(/);
  assert.match(plan, /updateMilestone\(/);
  assert.match(plan, /updateTask\(/);
  assert.match(plan, /tasksForMilestone\(/);
  assert.match(contract, /### Border-only Workspace implementation/);
});
