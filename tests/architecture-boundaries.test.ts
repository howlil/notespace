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
      assert.doesNotMatch(value, /^(?:[@~#]\/|src\/|(?:routes|pages|features|adapters|domain|shared)\/)/,
        "local import aliases require resolver support in the architecture check");
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

function featureEntryViolation(from: string, target: string): string | undefined {
  const feature = /^features\/([^/]+)(?:\/(.*))?$/.exec(target);
  if (!feature || /\.css(?:\?inline)?$/.test(target)) return;
  const owner = /^features\/([^/]+)\//.exec(from)?.[1];
  const entry = !feature[2] || /^index(?:\.ts)?$/.test(feature[2]);
  if (owner === feature[1]) return entry ? "feature internals cannot import their own entry" : undefined;
  return entry ? undefined : "feature callers must use its public entry";
}

test("feature entry guard rejects deep imports and self-barrels", () => {
  assert.ok(featureEntryViolation("pages/home/HomePage.tsx", "features/library/collection/WorkspaceLibrary"));
  assert.equal(featureEntryViolation("pages/home/HomePage.tsx", "features/library"), undefined);
  assert.ok(featureEntryViolation("features/library/explorer/LibrarySidebar.tsx", "features/library/index"));
  assert.equal(featureEntryViolation("features/library/explorer/LibrarySidebar.tsx", "features/library/explorer/use-library-navigation"), undefined);
  assert.equal(featureEntryViolation("routes/__root.tsx", "features/desktop/chrome/desktop-titlebar.css?inline"), undefined);
});

test("feature consumers use public entries and Canvas keeps its lazy boundary", () => {
  for (const file of collect(WEB_SRC)) {
    const from = relative(WEB_SRC, file).replaceAll("\\", "/");
    for (const dependency of localImports(file)) {
      const target = relative(WEB_SRC, dependency).replaceAll("\\", "/");
      assert.equal(featureEntryViolation(from, target), undefined, `${from} → ${target}`);
    }
  }
  const authoring = source("features/workspace-authoring/session/WorkspaceAuthoring.tsx");
  assert.match(authoring, /lazy\(\(\) => import\("\.\.\/canvas\/CanvasEditor"\)\)/);
  assert.doesNotMatch(source("features/workspace-authoring/index.ts"), /CanvasEditor/);
});

test("large feature roots contain only explicit capability entries", () => {
  const roots: Record<string, string[]> = {
    library: ["backup", "collection", "explorer", "index.ts", "use-library-revision.ts"],
    "workspace-authoring": ["canvas", "index.ts", "session", "workspace-authoring.css"],
    desktop: ["chrome", "index.ts", "lifecycle", "recovery", "updates"],
  };
  for (const [owner, entries] of Object.entries(roots)) {
    assert.deepEqual(readdirSync(join(WEB_SRC, "features", owner)).sort(), entries.sort(), `${owner}: place files in their owning capability`);
  }
});

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
  assert.throws(() => localImportSpecifiers('import { value } from "@/features/library";'), /aliases require resolver support/);
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

function assertDesktopSdkOwner(from: string, text: string) {
  if (from.startsWith("features/desktop/")) return;
  assert.doesNotMatch(text, /\b(?:from\s*|import\s*\(\s*|import\s*)["']@tauri-apps\//,
    `${from}: non-desktop features must delegate native IPC to adapters`);
}

test("non-desktop features delegate native SDK access to adapters", () => {
  for (const text of ['import { invoke } from "@tauri-apps/api/core";', 'const sdk = import("@tauri-apps/api/core");']) {
    assert.throws(() => assertDesktopSdkOwner("features/settings/Example.tsx", text));
    assert.doesNotThrow(() => assertDesktopSdkOwner("features/desktop/updates/Example.tsx", text));
  }
  for (const file of collect(join(WEB_SRC, "features"))) {
    assertDesktopSdkOwner(relative(WEB_SRC, file).replaceAll("\\", "/"), readFileSync(file, "utf8"));
  }
});

test("top-level source directories are intentional architecture boundaries", () => {
  const allowedTopLevel = new Set<string>(layers);
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
  assert.equal(existsSync(join(WEB_SRC, "styles")), false);
  assert.equal(existsSync(join(WEB_SRC, "domain", "project")), false);
  assert.equal(existsSync(join(WEB_SRC, "integrations")), false);
  assert.equal(existsSync(join(WEB_SRC, "features", "workspace")), false);
  assert.equal(existsSync(join(WEB_SRC, "features", "diagram")), false);
  assert.equal(existsSync(join(WEB_SRC, "features", "workspace-authoring", "canvas", "diagram.ts")), false);
  assert.equal(existsSync(join(WEB_SRC, "features", "workspace-authoring", "canvas", "DiagramPalette.tsx")), false);
  assert.equal(existsSync(join(WEB_SRC, "features", "workspace-authoring", "canvas", "diagram.test.ts")), false);
  assert.equal(existsSync(join(WEB_SRC, "features", "plan")), false);
  assert.equal(existsSync(join(WEB_SRC, "features", "study")), false);
  assert.equal(existsSync(join(WEB_SRC, "features", "planning")), false);
  assert.equal(existsSync(join(WEB_SRC, "features", "activity")), false);
  assert.equal(existsSync(join(WEB_SRC, "features", "library", "library-sync-store.ts")), false);
  assert.equal(existsSync(join(WEB_SRC, "features", "library", "workspace-mutation-policy.ts")), false);
  assert.equal(existsSync(join(WEB_SRC, "pages", "category", "CategoryPage.tsx")), false);
  assert.equal(existsSync(join(WEB_SRC, "features", "library", "CategoryLibrary.tsx")), false);
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
        /^features\/(dashboard|category|workspace)\//,
        `${relative(WEB_SRC, file)} imports a routed screen from features: ${target}`,
      );
    }
  }
});

test("frontend routes expose only canonical Home and Workspace surfaces", () => {
  const routeRoot = join(WEB_SRC, "routes");
  const routeFiles = collect(routeRoot)
    .map((file) => relative(routeRoot, file).replaceAll("\\", "/"))
    .sort();
  assert.deepEqual(routeFiles, ["__root.tsx", "index.tsx", "workspaces.$workspaceId.tsx"]);

  const routeTree = readFileSync(join(WEB_SRC, "routeTree.gen.ts"), "utf8");
  for (const legacyRoute of ["/inbox", "/today", "/projects/$projectId", "/categories/$categoryId"]) {
    assert.doesNotMatch(routeTree, new RegExp(legacyRoute.replaceAll("$", "\\$")), `${legacyRoute} must not return as a frontend route`);
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

test("retired Note authoring modules are absent", () => {
  for (const obsolete of [
    "features/workspace-authoring/document/DocumentEditor.tsx",
    "features/workspace-authoring/document/CanvasFrameLinkNode.tsx",
    "features/workspace-authoring/document/LocalImageNode.tsx",
    "features/workspace-authoring/model/use-workspace-commands.ts",
  ]) {
    assert.equal(existsSync(join(WEB_SRC, obsolete)), false, `${obsolete} should be retired`);
  }
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

test("workspace HTTP adapter does not retain dead study compatibility exports", () => {
  const workspaceApi = source("adapters/http/workspace-api.ts");
  for (const legacy of [
    "StudyStats",
    "StudySession",
    "StudyDay",
    "StudyActivity",
    "StudyDayDetail",
    "listStudySessions",
    "recordStudyHeartbeat",
    "deleteStudySession",
    "getWorkspaceStudy",
    "getStudyActivity",
    "getStudyDayDetail",
  ]) {
    assert.doesNotMatch(workspaceApi, new RegExp(legacy), `${legacy} must stay out of workspace-api`);
  }
});

test("HTTP client stays transport-only", () => {
  const client = source("adapters/http/client.ts");
  const workspaceApi = source("adapters/http/workspace-api.ts");

  assert.doesNotMatch(client, /domain\/workspace|WorkspaceHttpClient|createWorkspaceHttpClient|getWorkspace|updateWorkspaceSnapshot/);
  assert.match(workspaceApi, /createWorkspaceHttpClient/);
  assert.match(workspaceApi, /getWorkspace/);
  assert.match(workspaceApi, /updateWorkspaceCanvas/);
});

test("browser event and asset initialization stay behind explicit boundaries", () => {
  const dashboard = source("pages/home/HomePage.tsx");
  const sidebar = source("features/library/explorer/LibrarySidebar.tsx");
  const shell = source("pages/shell/LibraryPageShell.tsx");
  const quickOpen = source("features/search/QuickOpen.tsx");
  const canvas = source("features/workspace-authoring/canvas/CanvasEditor.tsx");
  assert.match(shell, /OPEN_QUICK_SEARCH_EVENT/);
  assert.match(dashboard, /<LibraryPageShell/);
  assert.match(quickOpen, /OPEN_QUICK_SEARCH_EVENT/);
  assert.doesNotMatch(sidebar, /new Event\("open-quick-search"\)/);
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
  assert.match(home, /WorkspaceLibrary/);
  assert.doesNotMatch(home, /createStandaloneTask|updateAnyTask|deleteAnyTask|createWorkspace|renameWorkspace|deleteWorkspace/);
  for (const obsolete of ["pages/inbox/InboxPage.tsx", "pages/today/TodayPage.tsx"]) {
    assert.equal(existsSync(join(WEB_SRC, obsolete)), false, `removed recovery screen persists: ${obsolete}`);
  }
});

test("workspace page composes Canvas authoring within the shared shell", () => {
  const page = source("pages/workspace/WorkspacePage.tsx");
  const authoring = source("features/workspace-authoring/session/WorkspaceAuthoring.tsx");

  assert.match(page, /useWorkspaceAuthoring/);
  assert.match(page, /<LibraryPageShell canvas/);
  assert.doesNotMatch(page, /WorkspacePlan/);
  assert.doesNotMatch(page, /ActivityIndicator|WorkspaceRail/);
  assert.doesNotMatch(page, /useWorkspaceSession/);

  assert.doesNotMatch(authoring, /workspace-main|renderPlan|renderActivityIndicator/);
});

test("workspace delegates authored state and autosave ownership to its session boundary", () => {
  const workspace = source("features/workspace-authoring/session/WorkspaceAuthoring.tsx");
  const session = source("features/workspace-authoring/session/use-workspace-session.ts");
  assert.match(workspace, /useWorkspaceSession/);
  assert.match(workspace, /export function useWorkspaceAuthoring/);
  assert.doesNotMatch(workspace, /useGranularWorkspaceAutosave/);
  assert.match(session, /useGranularWorkspaceAutosave/);
  assert.doesNotMatch(session, /updateNoteDocument|scheduleNote|flushNote/);
  assert.match(session, /updateCanvas/);
});

test("workspace authoring has no retired Note command boundary", () => {
  const workspace = source("features/workspace-authoring/session/WorkspaceAuthoring.tsx");

  assert.doesNotMatch(workspace, /adapters\/http\/workspace-api/);
  assert.doesNotMatch(workspace, /createWorkspaceNote|deleteWorkspaceNote/);
});

test("Canvas-only authoring does not depend on obsolete pane layout", () => {
  const workspace = source("features/workspace-authoring/session/WorkspaceAuthoring.tsx");
  assert.doesNotMatch(workspace, /useWorkspacePaneLayout|restoreLayout|paneInteractionState|resizeSplit/);
  assert.match(workspace, /useWorkspaceSession/);
  assert.match(workspace, /registerDesktopFlush/);
  assert.match(workspace, /<CanvasEditor/);
  assert.doesNotMatch(workspace, /DocumentEditor|selectedNote/);
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

test("Canvas integration delegates reusable scene derivation", () => {
  const canvas = source("features/workspace-authoring/canvas/CanvasEditor.tsx");

  assert.match(canvas, /deriveCanvasElementState/);
  assert.doesNotMatch(canvas, /shouldSwitchCodeBlockToManualHeight/);
});


test("shared library sidebar delegates library mutations to the library feature", () => {
  const sidebar = source("features/library/explorer/LibrarySidebar.tsx");
  const navigation = source("features/library/explorer/use-library-navigation.ts");

  assert.match(sidebar, /useLibraryNavigation/);
  assert.doesNotMatch(sidebar, /adapters\/http\/workspace-api|notifyLibraryChanged|workspaceRenameTitle/);
  assert.match(navigation, /adapters\/http\/workspace-api/);
  assert.match(navigation, /notifyLibraryChanged/);
});

test("diagram catalog metadata is owned by the diagram catalog module", () => {
  const diagram = source("domain/diagram/diagram.ts");
  const catalog = source("domain/diagram/catalog/diagram-catalog.ts");

  assert.match(diagram, /\.\/catalog\/diagram-catalog/);
  assert.doesNotMatch(diagram, /generatedIconMetadata|compatibilityCatalog/);
  assert.match(catalog, /eraser-icons\.generated\.json/);
  assert.match(catalog, /compatibilityCatalog/);
});

test("home page owns the library screen composition", () => {
  const home = source("pages/home/HomePage.tsx");
  const library = source("features/library/collection/WorkspaceLibrary.tsx");
  const model = source("features/library/collection/use-workspace-library.ts");

  assert.match(home, /<LibraryPageShell/);
  assert.match(source("pages/shell/LibraryPageShell.tsx"), /data-notespace-single-shell/);
  assert.match(home, /LibrarySidebar/);
  assert.match(home, /useWorkspaceLibrary/);
  assert.match(home, /WorkspaceLibrary/);

  assert.doesNotMatch(library, /dashboard-shell|renderNavigation|renderToolbar/);
  assert.doesNotMatch(library, /adapters\/http\//);
  assert.match(model, /adapters\/http\/workspace-api/);
});
