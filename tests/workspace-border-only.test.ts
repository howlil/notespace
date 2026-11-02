import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const ws = read("apps/web/src/pages/workspace/WorkspacePage.tsx");
const authoring = read("apps/web/src/features/workspace-authoring/ui/WorkspaceAuthoring.tsx");
const canvas = read("apps/web/src/features/workspace-authoring/canvas/CanvasChrome.tsx");
const document = read("apps/web/src/features/workspace-authoring/document/DocumentEditor.tsx");
const stylesheet = read("apps/web/src/features/workspace-authoring/workspace-authoring.css");

test("Canvas owns the only permanent Workspace authoring surface", () => {
  assert.match(ws, /<LibraryPageShell canvas/);
  assert.match(ws, /authoring\.authoringVisible/);
  assert.match(ws, /authoring\.status\.state/);
  assert.doesNotMatch(ws, /WorkspaceRail|ActivityIndicator|Focus mode|WorkspaceViewSwitcher/);
  assert.match(authoring, /<CanvasEditor/);
  assert.doesNotMatch(authoring, /splitPane|resizeSplit|useWorkspacePaneLayout|selectView/);
});

test("Tiptap remains available in a temporary editor and saves before close", () => {
  assert.match(authoring, /<Dialog open=\{!!selectedNote\}/);
  assert.match(authoring, /<DocumentEditor/);
  assert.match(authoring, /registerSnapshotFlush/);
  assert.match(authoring, /await flushAll\(\)/);
  assert.match(authoring, /registerDesktopFlush\(flushAll\)/);
  assert.match(authoring, /useBlocker/);
  assert.match(authoring, /onOpenNote=\{openNote\}/);
  assert.match(document, /<EditorContent editor=\{editor\}/);
});

test("Existing Canvas controls remain border-only with native tools", () => {
  assert.match(canvas, /Canvas tools".*onPointerDown/);
  assert.match(canvas, /Canvas view controls".*onPointerDown/);
  assert.match(canvas, /rounded-lg border border-line bg-surface p-1 shadow-none/);
  assert.match(canvas, /notespace-canvas-bottom-chrome.*absolute bottom-2 left-1\/2/);
  assert.match(stylesheet, /notespace-canvas-bottom-chrome\s*\{\s*bottom: calc\(8px \+ env\(safe-area-inset-bottom\)\) !important/);
});
