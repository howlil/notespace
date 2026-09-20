import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = process.cwd();
const WEB_SRC = join(ROOT, "apps", "web", "src");

function source(path: string) {
  return readFileSync(join(WEB_SRC, path), "utf8");
}

function collect(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...collect(path));
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts") && !name.endsWith(".test.tsx")) out.push(path);
  }
  return out;
}

function localImports(file: string) {
  const text = readFileSync(file, "utf8");
  return [...text.matchAll(/from\s+["']([^"']+)["']/g)]
    .map((match) => match[1])
    .filter((value) => value.startsWith("."))
    .map((value) => resolve(dirname(file), value));
}

test("domain modules do not depend on feature or integration implementation", () => {
  const domainRoot = join(WEB_SRC, "domain");
  for (const file of collect(domainRoot)) {
    for (const dependency of localImports(file)) {
      const path = relative(WEB_SRC, dependency).replaceAll("\\", "/");
      assert.doesNotMatch(path, /^(features|integrations)\//, `${relative(WEB_SRC, file)} depends upward on ${path}`);
    }
  }
});

test("document integration consumes Canvas frame links through the domain boundary", () => {
  const editor = source("integrations/document/DocumentEditor.tsx");
  const frameNode = source("integrations/document/CanvasFrameLinkNode.tsx");
  assert.match(editor, /\.\.\/\.\.\/domain\/workspace\/canvas-frame-link/);
  assert.match(frameNode, /\.\.\/\.\.\/domain\/workspace\/canvas-frame-link/);
  assert.doesNotMatch(editor, /features\/workspace\/canvas-frame-link/);
  assert.doesNotMatch(frameNode, /features\/workspace\/canvas-frame-link/);
});

test("workspace delegates authored state and autosave ownership to its session boundary", () => {
  const workspace = source("features/workspace/Workspace.tsx");
  const session = source("features/workspace/use-workspace-session.ts");
  assert.match(workspace, /useWorkspaceSession/);
  assert.doesNotMatch(workspace, /useGranularWorkspaceAutosave/);
  assert.match(session, /useGranularWorkspaceAutosave/);
  assert.match(session, /updateNoteDocument/);
  assert.match(session, /updateCanvas/);
});

test("editor integrations delegate reusable lifecycle and scene derivation", () => {
  const editor = source("integrations/document/DocumentEditor.tsx");
  const localImage = source("integrations/document/LocalImageNode.tsx");
  const frameNode = source("integrations/document/CanvasFrameLinkNode.tsx");
  const canvas = source("integrations/canvas/CanvasEditor.tsx");

  assert.match(editor, /useDocumentSnapshotSession/);
  assert.match(localImage, /useImageAssetUrl/);
  assert.match(frameNode, /useImageAssetUrl/);
  assert.match(canvas, /deriveCanvasElementState/);

  assert.doesNotMatch(editor, /URL\.createObjectURL|URL\.revokeObjectURL/);
  assert.doesNotMatch(localImage, /URL\.createObjectURL|URL\.revokeObjectURL/);
  assert.doesNotMatch(frameNode, /URL\.createObjectURL|URL\.revokeObjectURL/);
  assert.doesNotMatch(canvas, /shouldSwitchCodeBlockToManualHeight/);
});
