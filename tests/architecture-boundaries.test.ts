import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
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

function topLevelLayer(file: string) {
  return relative(WEB_SRC, file).replaceAll("\\", "/").split("/")[0] ?? "";
}

function assertLayerExcludes(layer: string, forbidden: readonly string[]) {
  const root = join(WEB_SRC, layer);
  if (!existsSync(root)) return;
  for (const file of collect(root)) {
    for (const dependency of localImports(file)) {
      const target = relative(WEB_SRC, dependency).replaceAll("\\", "/");
      const targetLayer = topLevelLayer(dependency);
      assert.ok(
        !forbidden.includes(targetLayer),
        `${relative(WEB_SRC, file)} in ${layer} depends on forbidden layer ${target}`,
      );
    }
  }
}

test("new web layers preserve downward dependency direction", () => {
  assertLayerExcludes("domain", ["routes", "pages", "features", "integrations", "components", "providers", "browser", "adapters", "shared"]);
  assertLayerExcludes("app", ["routes", "pages"]);
  assertLayerExcludes("pages", ["routes"]);
  assertLayerExcludes("features", ["routes", "pages"]);
  assertLayerExcludes("adapters", ["routes", "pages", "features"]);
  assertLayerExcludes("shared", ["routes", "pages", "features", "adapters", "domain"]);
});

test("legacy generic web buckets are removed after ownership migration", () => {
  assert.equal(existsSync(join(WEB_SRC, "components")), false);
  assert.equal(existsSync(join(WEB_SRC, "providers")), false);
});

test("routes compose pages instead of routed screens in features", () => {
  const routeRoot = join(WEB_SRC, "routes");
  for (const file of collect(routeRoot)) {
    for (const dependency of localImports(file)) {
      const target = relative(WEB_SRC, dependency).replaceAll("\\", "/");
      assert.doesNotMatch(
        target,
        /^features\/(dashboard|category|workspace|today|inbox)\//,
        `${relative(WEB_SRC, file)} imports a routed screen from features: ${target}`,
      );
    }
  }
});

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

test("diagram feature does not depend on Canvas integration internals", () => {
  const diagramRoot = join(WEB_SRC, "features", "diagram");
  for (const file of collect(diagramRoot)) {
    for (const dependency of localImports(file)) {
      const path = relative(WEB_SRC, dependency).replaceAll("\\", "/");
      assert.doesNotMatch(path, /^integrations\//, `${relative(WEB_SRC, file)} depends on ${path}`);
    }
  }
});

test("browser event and asset initialization stay behind explicit boundaries", () => {
  const dashboard = source("pages/home/HomePage.tsx");
  const quickOpen = source("features/search/QuickOpen.tsx");
  const canvas = source("integrations/canvas/CanvasEditor.tsx");
  assert.match(dashboard, /OPEN_QUICK_SEARCH_EVENT/);
  assert.match(quickOpen, /OPEN_QUICK_SEARCH_EVENT/);
  assert.doesNotMatch(dashboard, /new Event\("open-quick-search"\)/);
  assert.doesNotMatch(quickOpen, /addEventListener\("open-quick-search"/);
  assert.doesNotMatch(canvas, /^window\.EXCALIDRAW_ASSET_PATH/m);
  assert.match(canvas, /window\.EXCALIDRAW_ASSET_PATH = "\/excalidraw-assets\/"/);
});

test("workspace delegates authored state and autosave ownership to its session boundary", () => {
  const workspace = source("pages/workspace/WorkspacePage.tsx");
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
