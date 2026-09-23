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

function localImportSpecifiers(text: string) {
  const specifiers = new Set<string>();
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = match[1];
      if (!value.startsWith(".") || /\.(css|scss|sass|less)$/.test(value)) continue;
      specifiers.add(value);
    }
  }

  return [...specifiers];
}

function localImports(file: string) {
  return localImportSpecifiers(readFileSync(file, "utf8"))
    .map((value) => resolve(dirname(file), value));
}

const layers = ["routes", "pages", "features", "adapters", "domain", "shared"] as const;
type Layer = (typeof layers)[number];

const allowedDependencies: Record<Layer, ReadonlySet<Layer>> = {
  routes: new Set(["routes", "pages", "features", "adapters", "domain", "shared"]),
  pages: new Set(["pages", "features", "adapters", "domain", "shared"]),
  features: new Set(["features", "adapters", "domain", "shared"]),
  adapters: new Set(["adapters", "domain", "shared"]),
  domain: new Set(["domain"]),
  shared: new Set(["shared"]),
};

function topLevelLayer(file: string) {
  return relative(WEB_SRC, file).replaceAll("\\", "/").split("/")[0] ?? "";
}

function isLayer(value: string): value is Layer {
  return (layers as readonly string[]).includes(value);
}

function assertAllowedDependencyGraph() {
  for (const sourceLayer of layers) {
    const root = join(WEB_SRC, sourceLayer);
    if (!existsSync(root)) continue;

    for (const file of collect(root)) {
      for (const dependency of localImports(file)) {
        const target = relative(WEB_SRC, dependency).replaceAll("\\", "/");
        const targetLayer = topLevelLayer(dependency);

        assert.ok(
          isLayer(targetLayer) && allowedDependencies[sourceLayer].has(targetLayer),
          `${relative(WEB_SRC, file)} in ${sourceLayer} depends on disallowed boundary ${target}`,
        );
      }
    }
  }
}

test("architecture parser sees static, side-effect, and dynamic local imports", () => {
  assert.deepEqual(
    localImportSpecifiers(`
      import { staticValue } from "./static";
      import "./side-effect";
      const Lazy = lazy(() => import("./dynamic"));
      import React from "react";
      import "./styles.css";
    `),
    ["./static", "./side-effect", "./dynamic"],
  );
});

test("web layers follow the explicit dependency allowlist", () => {
  assertAllowedDependencyGraph();
});

test("top-level source directories are intentional architecture boundaries", () => {
  const allowedTopLevel = new Set<string>([...layers, "styles"]);
  const directories = readdirSync(WEB_SRC)
    .filter((name) => statSync(join(WEB_SRC, name)).isDirectory());

  for (const directory of directories) {
    assert.ok(allowedTopLevel.has(directory), `Unexpected top-level src boundary: ${directory}`);
  }
});

test("legacy generic web buckets are removed after ownership migration", () => {
  assert.equal(existsSync(join(WEB_SRC, "app")), false);
  assert.equal(existsSync(join(WEB_SRC, "components")), false);
  assert.equal(existsSync(join(WEB_SRC, "providers")), false);
  assert.equal(existsSync(join(WEB_SRC, "browser")), false);
  assert.equal(existsSync(join(WEB_SRC, "domain", "project")), false);
  assert.equal(existsSync(join(WEB_SRC, "integrations")), false);
  assert.equal(existsSync(join(WEB_SRC, "features", "workspace")), false);
  assert.equal(existsSync(join(WEB_SRC, "features", "diagram")), false);
  assert.equal(existsSync(join(WEB_SRC, "features", "workspace-authoring", "canvas", "diagram.ts")), false);
  assert.equal(existsSync(join(WEB_SRC, "features", "workspace-authoring", "canvas", "DiagramPalette.tsx")), false);
  assert.equal(existsSync(join(WEB_SRC, "features", "workspace-authoring", "canvas", "diagram.test.ts")), false);
  assert.equal(existsSync(join(WEB_SRC, "features", "plan")), false);
  assert.equal(existsSync(join(WEB_SRC, "features", "study")), false);
  assert.equal(existsSync(join(WEB_SRC, "features", "planning")), true);
  assert.equal(existsSync(join(WEB_SRC, "features", "activity")), true);
  assert.equal(existsSync(join(WEB_SRC, "features", "library", "library-sync-store.ts")), false);
  assert.equal(existsSync(join(WEB_SRC, "features", "library", "workspace-mutation-policy.ts")), false);
});

test("features do not depend on sibling feature implementations", () => {
  const root = join(WEB_SRC, "features");
  for (const file of collect(root)) {
    const owner = relative(root, file).replaceAll("\\", "/").split("/")[0];
    for (const dependency of localImports(file)) {
      const target = relative(root, dependency).replaceAll("\\", "/");
      if (target.startsWith("../")) continue;
      const targetOwner = target.split("/")[0];
      assert.equal(
        targetOwner,
        owner,
        `${relative(WEB_SRC, file)} crosses feature boundary into ${target}`,
      );
    }
  }
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

test("domain modules stay independent from browser and transport runtime", () => {
  const domainRoot = join(WEB_SRC, "domain");
  for (const file of collect(domainRoot)) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(
      text,
      /\bwindow\b|\bindexedDB\b|\blocalStorage\b|\bglobalThis\.fetch\b|\bfetch\s*\(/,
      `${relative(WEB_SRC, file)} contains browser or transport runtime behavior`,
    );
  }
  for (const legacyPath of [
    "domain/project/http.ts",
    "domain/project/api.ts",
    "domain/planning/api.ts",
    "domain/activity/api.ts",
    "domain/assets/local-image-assets.ts",
    "domain/project/granular-save.ts",
    "domain/project/save-project.ts",
    "domain/project/conflict-recovery.ts",
  ]) {
    assert.equal(existsSync(join(WEB_SRC, legacyPath)), false, `${legacyPath} should be migrated out of domain`);
  }
});

test("web code uses canonical Workspace domain imports", () => {
  for (const file of collect(WEB_SRC)) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(
      text,
      /domain\/project\//,
      `${relative(WEB_SRC, file)} still imports the legacy project domain`,
    );
  }
  assert.equal(existsSync(join(WEB_SRC, "domain", "workspace", "workspace.ts")), true);
});

test("document integration consumes Canvas frame links through the domain boundary", () => {
  const editor = source("features/workspace-authoring/document/DocumentEditor.tsx");
  const frameNode = source("features/workspace-authoring/document/CanvasFrameLinkNode.tsx");
  assert.match(editor, /\.\.\/\.\.\/domain\/workspace\/canvas-frame-link/);
  assert.match(frameNode, /\.\.\/\.\.\/domain\/workspace\/canvas-frame-link/);
  assert.doesNotMatch(editor, /features\/workspace\/canvas-frame-link/);
  assert.doesNotMatch(frameNode, /features\/workspace\/canvas-frame-link/);
});

test("diagram domain does not depend on workspace authoring internals", () => {
  const diagramRoot = join(WEB_SRC, "domain", "diagram");
  for (const file of collect(diagramRoot)) {
    for (const dependency of localImports(file)) {
      const path = relative(WEB_SRC, dependency).replaceAll("\\", "/");
      assert.doesNotMatch(
        path,
        /^features\/workspace-authoring\//,
        `${relative(WEB_SRC, file)} depends on ${path}`,
      );
    }
  }
});

test("generic browser storage lives in shared foundation", () => {
  assert.equal(existsSync(join(WEB_SRC, "adapters", "browser", "local-storage.ts")), false);
  assert.equal(existsSync(join(WEB_SRC, "shared", "browser", "local-storage.ts")), true);
});

test("HTTP client stays transport-only", () => {
  const client = source("adapters/http/client.ts");
  const workspaceApi = source("adapters/http/workspace-api.ts");

  assert.doesNotMatch(client, /domain\/workspace|WorkspaceHttpClient|createWorkspaceHttpClient|getWorkspace|updateWorkspaceSnapshot/);
  assert.match(workspaceApi, /createWorkspaceHttpClient/);
  assert.match(workspaceApi, /getWorkspace/);
  assert.match(workspaceApi, /updateWorkspaceSnapshot/);
});

test("browser event and asset initialization stay behind explicit boundaries", () => {
  const dashboard = source("pages/home/HomePage.tsx");
  const quickOpen = source("features/search/QuickOpen.tsx");
  const canvas = source("features/workspace-authoring/canvas/CanvasEditor.tsx");
  assert.match(dashboard, /OPEN_QUICK_SEARCH_EVENT/);
  assert.match(quickOpen, /OPEN_QUICK_SEARCH_EVENT/);
  assert.doesNotMatch(dashboard, /new Event\("open-quick-search"\)/);
  assert.doesNotMatch(quickOpen, /addEventListener\("open-quick-search"/);
  assert.doesNotMatch(canvas, /^window\.EXCALIDRAW_ASSET_PATH/m);
  assert.match(canvas, /window\.EXCALIDRAW_ASSET_PATH = "\/excalidraw-assets\/"/);
});

test("routed pages compose features instead of calling HTTP adapters directly", () => {
  const pagesRoot = join(WEB_SRC, "pages");
  for (const file of collect(pagesRoot)) {
    const pagePath = relative(pagesRoot, file).replaceAll("\\", "/");
    if (pagePath.startsWith("_shared/")) continue;

    for (const dependency of localImports(file)) {
      const target = relative(WEB_SRC, dependency).replaceAll("\\", "/");
      assert.doesNotMatch(
        target,
        /^adapters\/http\//,
        `${relative(WEB_SRC, file)} calls HTTP adapter directly through ${target}`,
      );
    }
  }

  const home = source("pages/home/HomePage.tsx");
  const category = source("pages/category/CategoryPage.tsx");
  const inbox = source("pages/inbox/InboxPage.tsx");
  const today = source("pages/today/TodayPage.tsx");
  assert.match(home, /WorkspaceLibrary/);
  assert.match(category, /CategoryLibrary/);
  assert.match(inbox, /InboxPlanning/);
  assert.match(today, /TodayPlanning/);
  for (const page of [home, category, inbox, today]) {
    assert.doesNotMatch(page, /createStandaloneTask|updateAnyTask|deleteAnyTask|createWorkspace|renameWorkspace|deleteWorkspace/);
  }
});

test("workspace page is a composition boundary for authoring, planning, and activity", () => {
  const page = source("pages/workspace/WorkspacePage.tsx");
  assert.match(page, /WorkspaceAuthoring/);
  assert.match(page, /WorkspacePlan/);
  assert.match(page, /ActivityIndicator/);
  assert.doesNotMatch(page, /useWorkspaceSession/);
});

test("workspace delegates authored state and autosave ownership to its session boundary", () => {
  const workspace = source("features/workspace-authoring/ui/WorkspaceAuthoring.tsx");
  const session = source("features/workspace-authoring/model/use-workspace-session.ts");
  assert.match(workspace, /useWorkspaceSession/);
  assert.doesNotMatch(workspace, /useGranularWorkspaceAutosave/);
  assert.match(session, /useGranularWorkspaceAutosave/);
  assert.match(session, /updateNoteDocument/);
  assert.match(session, /updateCanvas/);
});

test("workspace authoring delegates mutations to its command boundary", () => {
  const workspace = source("features/workspace-authoring/ui/WorkspaceAuthoring.tsx");
  const commands = source("features/workspace-authoring/model/use-workspace-commands.ts");

  assert.match(workspace, /useWorkspaceCommands/);
  assert.doesNotMatch(workspace, /adapters\/http\/workspace-api/);
  assert.doesNotMatch(workspace, /createWorkspaceNote|deleteWorkspaceNote/);

  assert.match(commands, /createWorkspaceNote/);
  assert.match(commands, /deleteWorkspaceNote/);
  assert.match(commands, /renameWorkspaceRequest/);
  assert.match(commands, /scheduleNote/);
  assert.match(commands, /flushNote/);
});

test("workspace authoring delegates pane navigation state to its layout controller", () => {
  const workspace = source("features/workspace-authoring/ui/WorkspaceAuthoring.tsx");
  const controller = source("features/workspace-authoring/model/use-workspace-pane-layout.ts");

  assert.match(workspace, /useWorkspacePaneLayout/);
  assert.doesNotMatch(workspace, /restoreLayout|mapNode|paneInteractionState|removeNode|updateSplit|writeLocalStorage/);

  assert.match(controller, /restoreLayout/);
  assert.match(controller, /paneInteractionState/);
  assert.match(controller, /switchPaneNote/);
  assert.match(controller, /closePane/);
  assert.match(controller, /selectView/);
  assert.match(controller, /focusCanvasFrame/);
  assert.match(controller, /resizeSplit/);
});

test("image store stays an orchestration facade over cache, remote I/O, and normalization", () => {
  const store = source("adapters/assets/image-store.ts");
  const cache = source("adapters/assets/image-cache.ts");
  const api = source("adapters/assets/image-api.ts");
  const normalizer = source("adapters/assets/image-normalizer.ts");

  assert.match(store, /image-cache/);
  assert.match(store, /image-api/);
  assert.match(store, /image-normalizer/);
  assert.doesNotMatch(store, /indexedDB|createImageBitmap|\/api\/workspaces\/.*\/assets/);

  assert.match(cache, /indexedDB/);
  assert.match(api, /\/api\/workspaces\//);
  assert.match(normalizer, /createImageBitmap/);
});

test("editor integrations delegate reusable lifecycle and scene derivation", () => {
  const editor = source("features/workspace-authoring/document/DocumentEditor.tsx");
  const localImage = source("features/workspace-authoring/document/LocalImageNode.tsx");
  const frameNode = source("features/workspace-authoring/document/CanvasFrameLinkNode.tsx");
  const canvas = source("features/workspace-authoring/canvas/CanvasEditor.tsx");

  assert.match(editor, /useDocumentSnapshotSession/);
  assert.match(localImage, /useImageAssetUrl/);
  assert.match(frameNode, /useImageAssetUrl/);
  assert.match(canvas, /deriveCanvasElementState/);

  assert.doesNotMatch(editor, /URL\.createObjectURL|URL\.revokeObjectURL/);
  assert.doesNotMatch(localImage, /URL\.createObjectURL|URL\.revokeObjectURL/);
  assert.doesNotMatch(frameNode, /URL\.createObjectURL|URL\.revokeObjectURL/);
  assert.doesNotMatch(canvas, /shouldSwitchCodeBlockToManualHeight/);
});
