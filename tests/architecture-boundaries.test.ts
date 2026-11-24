import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const WEB_SRC = join(ROOT, "apps", "web", "src");

function source(path: string) {
  return readFileSync(join(WEB_SRC, path), "utf8");
}

test("Canvas authoring keeps its lazy editor boundary", () => {
  const authoring = source("features/workspace-authoring/session/WorkspaceAuthoring.tsx");
  assert.match(authoring, /lazy\(\(\) => import\("\.\.\/canvas\/CanvasEditor"\)\)/);
  assert.doesNotMatch(source("features/workspace-authoring/index.ts"), /CanvasEditor/);
});

test("frontend routes expose only canonical Home and Workspace surfaces", () => {
  const routeRoot = join(WEB_SRC, "routes");
  const routeFiles = readdirSync(routeRoot, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name))
    .map((entry) => relative(routeRoot, join(entry.parentPath, entry.name)).replaceAll("\\", "/"))
    .sort();
  assert.deepEqual(routeFiles, ["__root.tsx", "index.tsx", "workspaces.$workspaceId.tsx"]);

  const routeTree = readFileSync(join(WEB_SRC, "routeTree.gen.ts"), "utf8");
  for (const legacyRoute of ["/inbox", "/today", "/projects/$projectId", "/categories/$categoryId"]) {
    assert.doesNotMatch(routeTree, new RegExp(legacyRoute.replaceAll("$", "\\$")), `${legacyRoute} must not return as a frontend route`);
  }
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
