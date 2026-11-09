import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const WEB_SRC = join(ROOT, "apps", "web", "src");
const WORKSPACE = join(WEB_SRC, "features", "workspace-authoring", "session", "WorkspaceAuthoring.tsx");
const WORKSPACE_PAGE = join(WEB_SRC, "pages", "workspace", "WorkspacePage.tsx");
const PAGE_SHELL = join(WEB_SRC, "pages", "shell", "LibraryPageShell.tsx");
const WORKSPACE_LIBRARY = join(WEB_SRC, "features", "library", "collection", "WorkspaceLibrary.tsx");
const SIDEBAR = join(WEB_SRC, "features", "library", "explorer", "LibrarySidebar.tsx");
const HOME = join(WEB_SRC, "pages", "home", "HomePage.tsx");
const RETIRED_ACTIVITY_DASHBOARD = join(WEB_SRC, "features", "activity", "ActivityDashboard.tsx");
const RETIRED_SHELL_RAIL = join(WEB_SRC, "pages", "_shared", "ShellRail.tsx");
const DIALOG = join(WEB_SRC, "shared", "ui", "overlays", "dialog.tsx");
const AUTHORING_STYLES = join(WEB_SRC, "features", "workspace-authoring", "workspace-authoring.css");
const CANVAS_CHROME = join(WEB_SRC, "features", "workspace-authoring", "canvas", "chrome", "CanvasChrome.tsx");
const CANVAS_SELECTION_ACTIONS = join(WEB_SRC, "features", "workspace-authoring", "canvas", "selection", "CanvasSelectionActions.tsx");

function source(path: string) { return readFileSync(path, "utf8"); }

test("responsive contract: Welcome and Canvas share a toggleable Explorer", () => {
  const workspace = source(WORKSPACE);
  const workspacePage = source(WORKSPACE_PAGE);
  const shell = source(PAGE_SHELL);
  const sidebar = source(SIDEBAR);
  const library = source(WORKSPACE_LIBRARY);
  assert.match(workspace, /<CanvasEditor/);
  assert.match(workspacePage, /<LibraryPageShell canvas/);
  assert.doesNotMatch(workspacePage, /WorkspaceRail|ActivityIndicator|focusMode/);
  assert.match(shell, /notespace-home-sidebar/);
  assert.match(shell, /w-\[228px\]/);
  assert.match(shell, /max-width: 760px/);
  assert.match(shell, /panel\.inert = !open/);
  assert.match(shell, /main\.inert = narrow && open/);
  assert.match(shell, /relative isolate[^"\n]*bg-canvas/, "Canvas chrome stays below the mobile Explorer");
  assert.match(shell, /aria-label="Notespace home"/);
  assert.match(shell, /aria-controls="notespace-home-sidebar"/);
  assert.match(shell, /motion-reduce:transition-none/);
  assert.doesNotMatch(shell, /explorerOpen && <div/);
  assert.match(shell, /Hide Explorer|Show Explorer/);
  assert.match(shell, /NotespaceLogo/);
  assert.match(shell, /preference/);
  const explorer = source(join(WEB_SRC, "features/library/explorer/library-explorer-provider.tsx"));
  assert.match(explorer, /drawerOpen/);
  assert.doesNotMatch(explorer, /setPreference\("closed"\)/);
  assert.doesNotMatch(source(join(WEB_SRC, "features/desktop/chrome/desktop-titlebar.css")), /:has\(#notespace-library-explorer\)/);
  assert.match(sidebar, /aria-label="Category explorer"/);
  assert.match(sidebar, /aria-label="New category"/);
  assert.match(library, /function WorkspaceFolderCard/);
  assert.match(library, /<WorkspaceListSkeleton/);
  assert.equal(existsSync(RETIRED_SHELL_RAIL), false);
});

test("responsive contract: standalone Home Activity dashboard is retired", () => {
  assert.equal(existsSync(RETIRED_ACTIVITY_DASHBOARD), false);
  assert.doesNotMatch(source(HOME), /ActivityDashboard|afterList/);
  assert.doesNotMatch(source(WORKSPACE_LIBRARY), /afterList/);
});

test("responsive contract: canvas chrome is compact, distinct, and touch-safe", () => {
  const authoringStyles = source(AUTHORING_STYLES);
  const chrome = source(CANVAS_CHROME);
  const selection = source(CANVAS_SELECTION_ACTIONS);
  assert.match(authoringStyles, /@media \(max-width: 560px\)/);
  assert.match(authoringStyles, /\.main-menu-trigger/);
  assert.match(authoringStyles, /\[data-testid="main-menu-trigger"\]/);
  assert.match(authoringStyles, /\.undo-redo-buttons/);
  assert.match(authoringStyles, /\.notespace-canvas-tool-dock[\s\S]*bottom: calc\(8px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(authoringStyles, /\.notespace-canvas-contextual-chrome[\s\S]*max-width: calc\(100% - 16px\)/);
  assert.match(chrome, /toolButton\?\.getBoundingClientRect/);
  assert.match(authoringStyles, /\[aria-label="Canvas view controls"\][\s\S]*right: 8px;\s*max-width: calc\(100% - 16px\)/);
  assert.doesNotMatch(authoringStyles, /\.notespace-selection-actions[\s\S]*bottom: calc\(50px/);
  assert.match(authoringStyles, /\[aria-label="Canvas tools"\] button[\s\S]*width: 32px !important/);
  assert.match(chrome, /nativeActionIcon/);
  assert.match(chrome, /secondaryToolGroups/);
  assert.match(chrome, /aria-label="More canvas tools"/);
  assert.doesNotMatch(chrome, /onPointerEnter=/);
  assert.match(chrome, /event\.key !== "\/"/);
  assert.match(chrome, /aria-label="More canvas actions"/);
  assert.match(chrome, /keepSelection: false/);
  assert.match(chrome, /nativeAction="undo" label="Undo"/);
  assert.match(chrome, /nativeAction="redo" label="Redo"/);
  assert.doesNotMatch(chrome, /min-\[561px\]:!size-10/);
  assert.match(chrome, /CanvasBottomChrome/);
  assert.match(chrome, /notespace-canvas-tool-dock/);
  assert.match(selection, /analyzeCanvasSelection/);
  assert.match(selection, /onInteractionStateChange/);
  assert.match(selection, /w-fit max-w-\[calc\(100vw-16px\)\]/);
  assert.match(selection, /aria-orientation=\{vertical \? "vertical" : "horizontal"\}/);
  assert.match(selection, /overflow-visible/);
  assert.match(selection, /Interact with embed/);
  assert.doesNotMatch(selection, /min-\[561px\]:left-\[48px\]|min-\[561px\]:flex-col|min-\[561px\]:left-\[calc\(100%\+6px\)\]/);
  assert.doesNotMatch(selection, /min-\[561px\]:size-10/);
});

test("responsive contract: shared dialogs stay inside viewport and above mobile navigation", () => {
  const dialog = source(DIALOG);
  assert.match(dialog, /max-h-\[calc\(100dvh_-_24px\)\]/);
  assert.match(dialog, /overflow-y-auto/);
  assert.match(dialog, /z-\[120\]/);
  assert.match(dialog, /max-\[480px\]:w-\[calc\(100vw_-_24px\)\]/);
});
