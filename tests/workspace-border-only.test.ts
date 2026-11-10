import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const ws = read("apps/web/src/pages/workspace/WorkspacePage.tsx");
const authoring = read("apps/web/src/features/workspace-authoring/session/WorkspaceAuthoring.tsx");
const canvas = ["CanvasToolRail.tsx", "CanvasViewControls.tsx", "CanvasBottomChrome.tsx"]
  .map((file) => read(`apps/web/src/features/workspace-authoring/canvas/chrome/${file}`)).join("\n");
const navigation = read("apps/web/src/features/library/explorer/use-library-navigation.ts");
const assets = read("apps/web/src/features/workspace-authoring/canvas/assets/use-canvas-assets.ts");
const stylesheet = read("apps/web/src/features/workspace-authoring/workspace-authoring.css");

test("Canvas owns the only permanent Workspace authoring surface", () => {
  assert.match(ws, /<LibraryPageShell canvas/);
  assert.match(ws, /authoring\.authoringVisible/);
  assert.match(ws, /authoring\.status\.state/);
  assert.doesNotMatch(ws, /WorkspaceRail|ActivityIndicator|Focus mode|WorkspaceViewSwitcher/);
  assert.match(authoring, /<CanvasEditor/);
  assert.doesNotMatch(authoring, /splitPane|resizeSplit|useWorkspacePaneLayout|selectView/);
});

test("Canvas authoring saves before close", () => {
  assert.match(authoring, /await flushAll\(\)/);
  assert.match(authoring, /registerDesktopFlush\(flushAll\)/);
  assert.match(authoring, /useBlocker/);
  assert.doesNotMatch(authoring, /DocumentEditor|selectedNote|onOpenNote/);
});

test("Workspace destructive actions and asset writes share the authoring boundary", () => {
  assert.match(ws, /onBeforeDeleteWorkspace/);
  assert.match(ws, /workspace-deleted/);
  assert.match(ws, /navigate\(\{ to: "\/" \}\)/);
  assert.match(authoring, /prepareForDestructiveAction/);
  assert.match(navigation, /onBeforeDeleteWorkspace/);
  assert.match(navigation, /await onBeforeDeleteWorkspace/);
  assert.match(assets, /flushPendingAssets/);
  assert.match(assets, /PendingCanvasAssetWrites/);
});

test("Existing Canvas controls remain border-only with native tools", () => {
  assert.match(canvas, /Canvas tools".*onPointerDown/);
  assert.match(canvas, /Canvas view controls".*onPointerDown/);
  assert.match(canvas, /rounded-lg border border-line bg-surface p-1 shadow-none/);
  assert.match(canvas, /notespace-canvas-tool-dock.*absolute top-1\/2 left-2/);
  assert.match(canvas, /data-anchored=\{anchored \? "true" : "false"\}/);
  assert.match(canvas, /notespace-canvas-contextual-chrome[^\n]*fixed z-\[100\]/);
  assert.match(stylesheet, /notespace-canvas-tool-dock[\s\S]*bottom: calc\(8px \+ env\(safe-area-inset-bottom\)\)/);
});
