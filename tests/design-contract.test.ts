import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const DESIGN = join(ROOT, "DESIGN.md");
const WEB = join(ROOT, "apps", "web");
const WEB_SRC = join(WEB, "src");
const GLOBALS = join(WEB_SRC, "shared", "styles", "globals.css");
const DESKTOP_TITLEBAR_STYLES = join(WEB_SRC, "features", "desktop", "chrome", "desktop-titlebar.css");
const DESKTOP_UPDATE_CONTROL = join(WEB_SRC, "features", "desktop", "updates", "DesktopUpdateControl.tsx");
const AUTHORING_STYLES = join(WEB_SRC, "features", "workspace-authoring", "workspace-authoring.css");
const ROOT_ROUTE = join(WEB_SRC, "routes", "__root.tsx");
const ROUTE_PENDING = join(WEB_SRC, "pages", "shell", "RoutePending.tsx");
const DASHBOARD = join(WEB_SRC, "pages", "home", "HomePage.tsx");
const PAGE_SHELL = join(WEB_SRC, "pages", "shell", "LibraryPageShell.tsx");
const RETIRED_SHELL_RAIL = join(WEB_SRC, "pages", "_shared", "ShellRail.tsx");
const WORKSPACE_LIBRARY = join(WEB_SRC, "features", "library", "collection", "WorkspaceLibrary.tsx");
const WORKSPACE_LIBRARY_MODEL = join(WEB_SRC, "features", "library", "collection", "use-workspace-library.ts");
const SIDEBAR = join(WEB_SRC, "features", "library", "explorer", "LibrarySidebar.tsx");
const RETIRED_QUICK_CAPTURE = join(WEB_SRC, "features", "capture", "QuickCapture.tsx");
const QUICK_OPEN = join(WEB_SRC, "features", "search", "QuickOpen.tsx");
const LIBRARY_TOOLS = join(WEB_SRC, "features", "library", "backup", "LibraryTools.tsx");
const WORKSPACE_PAGE = join(WEB_SRC, "pages", "workspace", "WorkspacePage.tsx");
const WORKSPACE = join(WEB_SRC, "features", "workspace-authoring", "session", "WorkspaceAuthoring.tsx");
const WORKSPACE_CONTENT = join(WEB_SRC, "features", "workspace-authoring", "session", "workspace-content.ts");
const DOCUMENT_EDITOR = join(WEB_SRC, "features", "workspace-authoring", "document", "DocumentEditor.tsx");
const DOCUMENT_SLASH_COMMANDS = join(WEB_SRC, "features", "workspace-authoring", "document", "document-slash-commands.ts");
const CANVAS = join(WEB_SRC, "features", "workspace-authoring", "canvas", "CanvasEditor.tsx");
const CANVAS_SCENE_STATE = join(WEB_SRC, "features", "workspace-authoring", "canvas", "state", "canvas-scene-state.ts");
const CANVAS_CHROME = join(WEB_SRC, "features", "workspace-authoring", "canvas", "chrome", "CanvasChrome.tsx");
const CANVAS_NATIVE_ACTIONS = join(WEB_SRC, "features", "workspace-authoring", "canvas", "native", "CanvasNativeActions.ts");
const CANVAS_SELECTION_ACTIONS = join(WEB_SRC, "features", "workspace-authoring", "canvas", "selection", "CanvasSelectionActions.tsx");
const ANCHORED_PANEL = join(WEB_SRC, "shared", "ui", "overlays", "anchored-panel.ts");
const CANVAS_PEER_CHANNEL = join(WEB_SRC, "features", "workspace-authoring", "canvas", "sync", "use-canvas-peer-channel.ts");
const CANVAS_CODE_BLOCK = join(WEB_SRC, "features", "workspace-authoring", "canvas", "code", "canvas-code-block.ts");
const CANVAS_CODE_BLOCK_LAYER = join(WEB_SRC, "features", "workspace-authoring", "canvas", "code", "CanvasCodeBlockLayer.tsx");
const CANVAS_CODE_BLOCK_ACTIONS = join(WEB_SRC, "features", "workspace-authoring", "canvas", "code", "CanvasCodeBlockActions.tsx");
const CANVAS_CODE_BLOCK_MEASURE = join(WEB_SRC, "features", "workspace-authoring", "canvas", "code", "CanvasCodeBlockMeasure.tsx");
const CANVAS_CODE_BLOCK_LAYOUT = join(WEB_SRC, "features", "workspace-authoring", "canvas", "code", "canvas-code-block-layout.ts");
const CANVAS_CODE_RUNNER = join(WEB_SRC, "features", "workspace-authoring", "canvas", "code", "canvas-code-runner.ts");
const CANVAS_CODE_RUNNER_HOOK = join(WEB_SRC, "features", "workspace-authoring", "canvas", "code", "use-canvas-code-runner.ts");
const CODE_LANGUAGE = join(WEB_SRC, "domain", "code", "code-language.ts");
const CODE_RUNNER = join(WEB_SRC, "features", "workspace-authoring", "canvas", "code", "execution", "code-runner.ts");
const CODE_RUNNER_HOOK = join(WEB_SRC, "features", "workspace-authoring", "canvas", "code", "execution", "use-code-runner.ts");
const CODE_RUNNER_WORKER = join(WEB, "public", "code-runner-worker.js");
const NOTE_CODE_BLOCK = join(WEB_SRC, "features", "workspace-authoring", "document", "NoteCodeBlockNode.tsx");
const DIAGRAM_PALETTE = join(WEB_SRC, "features", "workspace-authoring", "canvas", "diagram", "palette", "DiagramPalette.tsx");
const TOAST_PROVIDER = join(WEB_SRC, "shared", "ui", "feedback", "toast-provider.tsx");
const RETIRED_ACTIVITY_FEATURE = join(WEB_SRC, "features", "activity");
const RETIRED_CAPTURE_FEATURE = join(WEB_SRC, "features", "capture");
const SKELETON = join(WEB_SRC, "shared", "ui", "feedback", "skeleton.tsx");
const WORKSPACE_LIST_SKELETON = join(WEB_SRC, "features", "library", "collection", "WorkspaceListSkeleton.tsx");
const DISMISSABLE_POPUP = join(WEB_SRC, "shared", "ui", "overlays", "dismissable.tsx");
const CONFIRM_DIALOG = join(WEB_SRC, "shared", "ui", "overlays", "confirm-dialog.tsx");
const IMAGE_ASSETS = join(WEB_SRC, "adapters", "assets", "image-store.ts");
const IMAGE_ASSET_CORE = join(WEB_SRC, "adapters", "assets", "image-store-core.ts");
const IMAGE_ASSET_API = join(WEB_SRC, "adapters", "assets", "image-api.ts");
const IMAGE_ASSET_CACHE = join(WEB_SRC, "adapters", "assets", "image-cache.ts");
const ROUTER = join(WEB_SRC, "router.tsx");
const WEB_PACKAGE = join(WEB, "package.json");
const VITE_CONFIG = join(WEB, "vite.config.ts");
const FAVICON = join(WEB, "public", "favicon.svg");

function collectFiles(dir: string, extensions: string[]): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...collectFiles(full, extensions));
    else if (extensions.some((extension) => entry.endsWith(extension))) files.push(full);
  }
  return files;
}
function source(path: string) { return readFileSync(path, "utf8"); }

test("design token contract: DESIGN.md documents the runtime semantic tokens", () => {
  const design = source(DESIGN); const globals = source(GLOBALS);
  for (const token of ["--bg", "--surface", "--sidebar", "--canvas", "--ink", "--muted", "--line", "--accent", "--tint", "--button", "--button-text", "--danger", "--success"]) assert.match(design, new RegExp(token));
  assert.match(design, /--font-sans/); assert.match(design, /Motion tokens/); assert.match(design, /prefers-reduced-motion/); assert.match(design, /z-1000/);
  assert.match(globals, /--accent:\s*#2858d8/i); assert.match(globals, /--tint:\s*#eaf0ff/i); assert.match(globals, /--font-sans:\s*"Open Sans"/);
});

test("Fox Spirit Cobalt identity: landing and runtime use the same accent/tint", () => {
  const landing = source(join(ROOT, "landing", "src", "styles", "global.css"));
  const hero = source(join(ROOT, "landing", "src", "styles", "white-hero.css"));
  const design = source(DESIGN);
  for (const [token, value] of [["accent", "#2858d8"], ["tint", "#eaf0ff"]] as const) {
    assert.match(landing, new RegExp(`--${token}:\\s*${value}`, "i"));
    assert.match(source(GLOBALS), new RegExp(`--${token}:\\s*${value}`, "i"));
  }
  assert.match(design, /cobalt-blue identity/);
  assert.doesNotMatch(hero, /#4f7396|#e8eef6/i);
  for (const surface of ["apps/web", "landing"]) {
    const asset = (file: string) => source(join(ROOT, surface, "public", file));
    for (const name of ["head", "full", "micro"]) {
      const svg = asset(`brand/notespace-fox-${name}.svg`);
      assert.match(svg, /#2858d8/i);
      assert.match(svg, /#fff(?:fff)?\b/i);
      assert.doesNotMatch(svg, /<linearGradient|<filter/i, "brand mark must remain two-color flat");
    }
    assert.match(asset("favicon.svg"), /#2858d8/i);
    assert.match(asset("favicon.svg"), /#fff(?:fff)?\b/i);
  }
  assert.match(hero, /\.ns-white-primary:hover\s*\{\s*background:\s*color-mix\(/);
});

test("frontend styling contract: Tailwind v4 uses the official Vite and CSS-first setup", () => {
  const packageJson = source(WEB_PACKAGE); const vite = source(VITE_CONFIG); const globals = source(GLOBALS);
  assert.match(packageJson, /"tailwindcss":/); assert.match(packageJson, /"@tailwindcss\/vite":/);
  assert.match(vite, /import tailwindcss from "@tailwindcss\/vite"/); assert.match(vite, /tailwindcss\(\)/); assert.match(globals, /@import "tailwindcss";/); assert.match(globals, /@theme/);
  assert.doesNotMatch(globals, /@tailwind\s+(base|components|utilities)/); assert.doesNotMatch(globals, /@config\s+/); assert.equal(existsSync(join(WEB, "tailwind.config.ts")), false);
});

test("frontend styling contract: global, authoring, and desktop chrome CSS have explicit owners", () => {
  const authoringStyles = source(AUTHORING_STYLES);
  assert.deepEqual(collectFiles(WEB_SRC, [".css"]).sort(), [AUTHORING_STYLES, GLOBALS, DESKTOP_TITLEBAR_STYLES].sort());
  assert.match(source(DESKTOP_TITLEBAR_STYLES), /\.desktop-shell--custom/);
  assert.match(source(ROOT_ROUTE), /import globalStyles from "\.\.\/shared\/styles\/globals\.css\?inline";/);
  assert.match(source(ROOT_ROUTE), /import workspaceAuthoringStyles from "\.\.\/features\/workspace-authoring\/workspace-authoring\.css\?inline";/);
  assert.match(source(ROOT_ROUTE), /import desktopTitlebarStyles from "\.\.\/features\/desktop\/chrome\/desktop-titlebar\.css\?inline";/);
  for (const style of ["globalStyles", "workspaceAuthoringStyles", "desktopTitlebarStyles"]) {
    assert.match(source(ROOT_ROUTE), new RegExp(`children: ${style}`));
  }
  assert.match(authoringStyles, /input\[type="range"\]\[aria-label="Opacity"\][\s\S]*width:\s*62px;[\s\S]*flex:\s*0 0 62px/);
  for (const file of collectFiles(WEB_SRC, [".ts", ".tsx"])) { if (file === ROOT_ROUTE) continue; assert.doesNotMatch(source(file), /import\s+["']\.\.?\/[^"']+\.css["']/, `feature stylesheet import remains in ${file}`); }
  assert.match(source(CANVAS), /import "@excalidraw\/excalidraw\/index\.css";/);
});

test("frontend styling contract: globals owns tokens and document defaults, not feature selectors", () => {
  const globals = source(GLOBALS);
  assert.match(globals, /--sidebar:\s*#fff/i); assert.match(globals, /--accent:\s*#2858d8/i); assert.match(globals, /--tint:\s*#eaf0ff/i); assert.match(globals, /--accent:\s*#91b1ff/i); assert.match(globals, /--tint:\s*#223254/i); assert.match(globals, /@layer base/); assert.match(globals, /prefers-reduced-motion/);
  for (const selector of [/\.sidebar\b/, /\.dashboard\b/, /\.tiptap\b/, /\.pane-resizer\b/, /\.toast-viewport\b/, /\.workspace-main\b/]) assert.doesNotMatch(globals, selector, `feature selector ${selector} leaked into globals.css`);
});

test("canvas contract: tool, contextual, and viewport chrome have distinct ownership", () => {
  const authoringStyles = source(AUTHORING_STYLES), canvas = source(CANVAS), chrome = source(CANVAS_CHROME), nativeActions = source(CANVAS_NATIVE_ACTIONS), selection = source(CANVAS_SELECTION_ACTIONS), peerChannel = source(CANVAS_PEER_CHANNEL);
  assert.match(authoringStyles, /\.notespace-canvas-surface \.excalidraw\s*\{/);
  assert.match(authoringStyles, /--color-primary:\s*var\(--accent\)/);
  assert.match(authoringStyles, /\.notespace-canvas-surface \.excalidraw \.App-toolbar/);
  assert.match(authoringStyles, /\.notespace-canvas-surface \.excalidraw \.App-menu_top/);
  assert.match(authoringStyles, /\.notespace-canvas-surface \.mobile-shape-actions,/);
  assert.match(authoringStyles, /display:\s*none\s*!important/);
  assert.match(canvas, /className="notespace-canvas-surface/);
  assert.match(canvas, /<CanvasBottomChrome/);
  assert.match(chrome, /notespace-canvas-tool-dock/);
  assert.match(chrome, /data-canvas-tool/);
  assert.match(canvas, /<CanvasToolRail/);
  assert.match(canvas, /<CanvasViewControls/);
  assert.match(canvas, /<CanvasSelectionActions/);
  assert.match(canvas, /activeCanvasOverlay/);
  assert.doesNotMatch(canvas, /<CanvasToolbar|<CanvasUtilityBar|<CanvasDetailsPanel/);
  assert.doesNotMatch(canvas, /openDetailsForDoubleClick|onDoubleClick=/);
  assert.match(canvas, /selectedElementIds/);
  assert.match(canvas, /CaptureUpdateAction\.IMMEDIATELY/);
  assert.match(canvas, /name === "imageExport"/);
  assert.match(canvas, /openDialog: \{ name: "commandPalette" \}/);
  assert.match(canvas, /toggleSidebar\(\{ name: "default", tab: "search", force: !isSearchOpen \}\)/);
  assert.match(canvas, /import \{\s*executeNativeAction,[\s\S]*?\} from "\.\/native\/CanvasNativeActions"/);
  assert.match(canvas, /executeNativeAction\(value, name\)/);
  assert.doesNotMatch(canvas, /actionManager\.actions\[name\]/);
  assert.match(canvas, /isCanvasObjectManipulating/);
  assert.match(canvas, /isManipulating=\{isObjectManipulating\}/);
  assert.match(canvas, /setCanvasBackground/);
  assert.doesNotMatch(canvas, /<MainMenu/);
  assert.match(canvas, /useCanvasPeerChannel\(workspaceId, handlePeerSnapshot\)/);
  assert.match(peerChannel, /new BroadcastChannel\(`notespace\.canvas:\$\{workspaceId\}`\)/);
  const codeBlock = source(CANVAS_CODE_BLOCK), codeLayer = source(CANVAS_CODE_BLOCK_LAYER), codeActions = source(CANVAS_CODE_BLOCK_ACTIONS), codeMeasure = source(CANVAS_CODE_BLOCK_MEASURE), codeLayout = source(CANVAS_CODE_BLOCK_LAYOUT), canvasRunnerHook = source(CANVAS_CODE_RUNNER_HOOK), codeLanguage = source(CODE_LANGUAGE), codeRunnerHook = source(CODE_RUNNER_HOOK);
  assert.match(codeBlock, /CODE_BLOCK_DATA_KEY = "notespaceCodeBlock"/);
  assert.match(codeBlock, /domain\/code\/code-language/);
  assert.match(codeLanguage, /createLowlight\(common\)/);
  assert.match(codeLanguage, /highlightAuto/);
  assert.match(codeBlock, /theme: CodeBlockTheme/);
  assert.match(codeBlock, /heightMode: CodeBlockHeightMode/);
  assert.match(codeBlock, /data\.heightMode === "manual" \? "manual" : "auto"/);
  assert.match(codeLayer, /readCanvasCodeBlock/);
  assert.match(codeLayer, /JetBrains Mono/);
  assert.match(codeLayer, /whitespace-pre-wrap/);
  assert.match(codeLayer, /overflow-wrap:anywhere/);
  assert.match(codeLayer, /CanvasCodeBlockMeasure/);
  assert.match(codeLayer, /Code output/);
  assert.match(codeLayer, /data-canvas-code-header/);
  assert.match(codeLayer, /Run JavaScript/);
  assert.match(codeLayer, /Copy code/);
  assert.match(codeLayer, /Collapse code output/);
  assert.doesNotMatch(codeLayer, /aria-label="Code language"/); assert.match(codeLayer, /aria-label="Edit code block"/);
  assert.match(codeActions, /aria-label="Code block settings"/);
  assert.match(codeActions, /aria-label="Code language"/);
  assert.match(codeActions, /Fit code height/);
  assert.doesNotMatch(codeActions, /Edit code|Finish editing|Pencil/);
  assert.doesNotMatch(codeActions, /Run JavaScript|Copy code/);
  assert.match(codeMeasure, /scrollHeight/);
  assert.match(codeMeasure, /codeBlockContentWidth/);
  assert.match(codeLayout, /shouldSwitchCodeBlockToManualHeight/);
  assert.match(canvas, /convertToExcalidrawElements/);
  assert.match(canvas, /customData: withCanvasCodeBlock/);
  assert.match(canvas, /onDoubleClickCapture/);
  assert.match(canvas, /codeElementContainsClientPoint/);
  assert.match(canvas, /setEditingCodeBlockId\(element\.id\)/);
  assert.match(codeLayer, /aria-label=\{editing \? "Live syntax preview" : undefined\}/);
  assert.match(codeLayer, /WebkitTextFillColor: "transparent"/);
  assert.match(codeLayer, /caretColor: palette\.foreground/);
  assert.match(codeLayer, /onBlur=\{\(event\) =>/);
  assert.match(source(CANVAS_SCENE_STATE), /deriveCanvasElementState/);
  assert.doesNotMatch(codeLayer, /localStorage|fetch\(|WebSocket|new Worker/);
  const canvasRunner = source(CANVAS_CODE_RUNNER), codeRunner = source(CODE_RUNNER);
  assert.match(canvasRunner, /canRunCanvasCode = canRunCode/);
  assert.match(canvasRunnerHook, /useCodeRunner/);
  assert.match(codeRunnerHook, /startJavaScriptRun/);
  assert.match(codeRunner, /new Worker/);
  assert.match(codeRunner, /DEFAULT_CODE_RUN_TIMEOUT_MS = 2_000/);
  assert.match(codeRunner, /MAX_CODE_RUN_OUTPUT_LINES = 100/);
  assert.match(source(CODE_RUNNER_WORKER), /self\.fetch = \(\) => Promise\.reject/);
  assert.match(codeRunner, /worker\.terminate\(\)/);
  assert.doesNotMatch(codeRunner, /\/api\//);
  assert.match(canvas, /reconcileElements\(/);
  assert.match(canvas, /getSceneElementsIncludingDeleted\(\)/);
  assert.match(canvas, /persistedAppState/);
  assert.match(source(CANVAS_SCENE_STATE), /authoredSceneData/);
  assert.match(source(CANVAS_SCENE_STATE), /sameElementVersions/);
  assert.match(canvas, /hasStructuredDiagrams/);
  assert.match(canvas, /lastExternalScene\.current = serialized/);
  assert.match(canvas, /validateEmbeddable=\{true\}/);
  assert.doesNotMatch(canvas, /validateEmbeddable=\{false\}|validateCanvasEmbeddable/);

  assert.match(nativeActions, /export function nativeActionIcon/);
  assert.match(nativeActions, /export function executeNativeAction/);
  assert.match(nativeActions, /function actionManager/);
  assert.doesNotMatch(nativeActions, /lucide-react/);

  assert.match(chrome, /aria-label="Canvas tools"/);
  assert.match(chrome, /aria-label="Canvas view controls"/);
  assert.match(chrome, /primaryTools/);
  assert.match(chrome, /secondaryToolGroups/);
  assert.match(chrome, /isToolSupported/);
  assert.match(chrome, /More tools/);
  assert.match(chrome, /diagramAnchorRef/);
  assert.match(chrome, /moreToolsAnchorRef/);
  assert.match(canvas, /diagramAnchorRef=\{diagramAnchorRef\}/);
  assert.match(canvas, /moreToolsAnchorRef=\{moreToolsAnchorRef\}/);
  assert.match(canvas, /anchorRef=\{diagramAnchorRef\}/);
  assert.match(chrome, /canvasBackgroundOptions/);
  assert.match(chrome, /function CanvasCommandMenu/);
  assert.match(chrome, /aria-label="Canvas options"/);
  assert.match(chrome, /aria-haspopup="dialog"/);
  assert.doesNotMatch(chrome, /CanvasViewSettingsPanel|Canvas view settings|NativeAdjustmentsIcon/);
  assert.match(chrome, /className="pointer-events-auto absolute top-2 right-2 z-20 flex max-w-/);
  assert.match(chrome, /<span>Library<\/span>/);
  assert.match(chrome, /toggleSidebar/);
  assert.match(chrome, /tab === "library"/);
  assert.match(chrome, /useAnchoredPanelPosition/);
  assert.match(chrome, /useAnchoredPanelDismiss/);
  assert.match(chrome, /horizontalAlignment: "end"/);
  assert.match(chrome, /\[scrollbar-width:none\].*\[&::-webkit-scrollbar\]:hidden/);
  assert.match(chrome, /createPortal/);
  assert.match(chrome, /motion\.aside/);
  assert.match(chrome, /import \{ nativeActionIcon \} from "\.\.\/native\/CanvasNativeActions"/);
  assert.doesNotMatch(chrome, /function nativeActionIcon|function NativeSvg|function NativeToolIcon/);
  assert.match(chrome, /nativeAction="zoomIn" label="Zoom in"/); assert.match(chrome, /nativeAction="zoomOut" label="Zoom out"/); assert.match(chrome, /nativeAction="zoomToFit" label="Fit canvas"/);
  assert.match(chrome, /onAction\("gridMode"\)/); assert.match(chrome, /onAction\("objectsSnapMode"\)/); assert.match(chrome, /runQuickAction\("zoomToFit"\)/);
  assert.match(chrome, /nativeAction="undo" label="Undo"/); assert.match(chrome, /nativeAction="redo" label="Redo"/);
  assert.match(chrome, /aria-label="Canvas zoom controls"/); assert.match(chrome, /aria-label="Canvas history controls"/);
  const canvasCommandMenu = chrome.slice(chrome.indexOf("function CanvasCommandMenu"), chrome.indexOf("export function CanvasToolRail"));
  const canvasViewControls = chrome.slice(chrome.indexOf("export function CanvasViewControls"));
  assert.doesNotMatch(canvasCommandMenu, /Canvas zoom controls|Canvas history controls/);
  assert.match(canvasViewControls, /Canvas zoom controls[\s\S]*Canvas history controls[\s\S]*canvas-options-trigger/);
  assert.match(chrome, /Canvas options/);
  assert.doesNotMatch(chrome, /min-\[561px\]:!size-10/);
  for (const group of ["View", "Select", "Insert", "Present", "Paint", "Canvas", "File & export", "Navigate & help"]) assert.match(chrome, new RegExp(group.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (const action of ["Reset canvas", "Open", "Export image", "Copy as PNG", "Copy as SVG", "Save to file", "Command palette", "Find on canvas", "Help"]) assert.match(chrome, new RegExp(`label=\\"${action.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\"`));
  assert.match(chrome, /aria-label="More canvas actions"/);
  assert.doesNotMatch(chrome, /position\?\.top \?\? -10000/);
  for (const redundant of ["duplicateSelection", "deleteSelectedElements", "bringToFront", "sendToBack", "alignLeft", "distributeHorizontally", "flipHorizontal", "toggleElementLock", "wrapSelectionInFrame", "addToLibrary"]) assert.doesNotMatch(chrome, new RegExp(redundant));

  assert.match(selection, /"Selected shape actions"/);
  assert.match(selection, /aria-orientation=\{vertical \? "vertical" : "horizontal"\}/);
  assert.doesNotMatch(selection, /<motion\.div\s+ref=\{rootRef\}/);
  assert.match(selection, /onKeyDownCapture/);
  assert.match(selection, /onKeyUpCapture/);
  assert.match(selection, /shapeProperties = .*textEditing/);
  assert.match(selection, /showText = textEditing/);
  assert.match(selection, /type PanelLayout/);
  assert.match(selection, /updatePanelLayout/);
  assert.match(selection, /top: panelLayout\?\.top/);
  assert.doesNotMatch(selection, /transform: "translateX\(-50%\)"/);
  assert.match(selection, /overflow-visible/);
  assert.match(selection, /import \{ executeNativeAction, nativeActionAvailable, nativeActionIcon \} from "\.\.\/native\/CanvasNativeActions"/);
  assert.doesNotMatch(selection, /function nativeActionIcon|function NativeIconFrame|function AdjustmentsIcon|function UndoIcon|function RedoIcon|function DuplicateIcon|function DeleteIcon/);
  assert.match(chrome, /CanvasBottomChrome/);
  assert.match(chrome, /notespace-canvas-tool-dock/);
  assert.match(chrome, /toolButton\?\.getBoundingClientRect/);
  assert.match(chrome, /aria-label="More canvas tools"/);
  assert.doesNotMatch(chrome, /onPointerEnter=/);
  assert.match(selection, /analyzeCanvasSelection/);
  assert.match(selection, /onInteractionStateChange/);
  assert.match(selection, /isManipulating = false/);
  assert.match(selection, /!isManipulating/);
  assert.match(selection, /!contextMenuOpen/);
  assert.match(canvas, /onStateChange\("contextMenu"/);
  assert.match(canvas, /closeNativeMenuOnEscape/);
  assert.match(canvas, /appState: \{ contextMenu: null \}/);
  assert.match(canvas, /onOverlayClose=\{closeSelectionOverlay\}/);
  assert.match(selection, /const quickSelectionActions/);
  assert.match(selection, /\.slice\(0, 3\)/);
  assert.match(selection, /Section label="Edit"/);
  assert.match(selection, /Section label="Layer"/);
  assert.match(selection, /PropertyMenuAction label=\{propertiesLabel\}/);
  assert.match(selection, /name="duplicateSelection" label="Duplicate"/);
  assert.match(selection, /name="deleteSelectedElements" label="Delete"/);
  assert.doesNotMatch(selection, /More drawing options|Drawing styles/);
  assert.match(selection, /Interact with embed/);
  assert.match(selection, /activeEmbeddable/);
  assert.doesNotMatch(selection, /CompactButton label="Layer"/);
  assert.match(selection, /Section label="Align & distribute"/);
  assert.match(selection, /w-fit max-w-\[calc\(100vw-16px\)\]/);
  assert.match(chrome, /aboveAnchor - height - surfaceGap/);
  assert.doesNotMatch(selection, /min-\[561px\]:left-\[48px\]|min-\[561px\]:flex-col|min-\[561px\]:left-\[calc\(100%\+6px\)\]/);
  assert.match(selection, /toggleLinearEditor/);
  assert.match(selection, /Font family/); assert.match(selection, /Text properties/);
  assert.match(selection, /type Panel = "color" \| "properties"/);
  assert.match(selection, /properties: "w-max max-w-\[calc\(100vw-24px\)\]"/);
  assert.match(selection, /\[scrollbar-width:none\]/);
  assert.match(selection, /function OpacityControl/);
  assert.match(selection, /w-\[104px\]/);
  assert.match(selection, /strokeColorOptions/); assert.match(selection, /fillColorOptions/);
  assert.match(selection, /Line feel/); assert.match(selection, /Clean/); assert.match(selection, /Hand-drawn/); assert.match(selection, /Rough/);
  assert.doesNotMatch(selection, /type Panel = "stroke"|type Panel = "fill"|min-\[561px\]:size-10/);
  assert.doesNotMatch(selection, /label="Undo"|label="Redo"/);
  for (const group of ["Layer", "Align & distribute", "Group", "Transform & reuse"]) assert.match(selection, new RegExp(group.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (const styleState of ["currentItemStrokeColor", "currentItemBackgroundColor", "currentItemFillStyle", "currentItemStrokeWidthKey", "currentItemStrokeStyle", "currentItemRoughness", "currentItemRoundness", "currentItemOpacity", "currentItemStartArrowhead", "currentItemEndArrowhead", "currentItemFontFamily", "currentItemFontSize", "currentItemTextAlign"]) assert.match(selection, new RegExp(styleState));
  for (const action of ["group", "ungroup", "bringToFront", "sendToBack", "alignLeft", "distributeHorizontally", "flipHorizontal", "toggleElementLock", "wrapSelectionInFrame", "addToLibrary"]) assert.match(selection, new RegExp(action));

  const diagram = source(DIAGRAM_PALETTE);
  assert.match(diagram, /useAnchoredPanelPosition/);
  assert.match(diagram, /useAnchoredPanelDismiss/);
  assert.match(diagram, /aria-label="Close diagram tools"/);
  assert.match(diagram, /draggable/);
  assert.doesNotMatch(diagram, /All Categories<\/div>/);
  assert.match(diagram, /createPortal/);
  assert.match(diagram, /fixed z-\[1000\]/);
  assert.match(diagram, /const showResults = hasSearch \|\| category !== "all"/);
  assert.match(diagram, /showResults &&/);
  assert.match(source(ANCHORED_PANEL), /belowSpace < height/);
  assert.match(source(ANCHORED_PANEL), /aboveSpace > belowSpace/);
  assert.match(source(ANCHORED_PANEL), /requestAnimationFrame/);
  assert.match(source(ANCHORED_PANEL), /ResizeObserver/);
  assert.match(diagram, /AnimatePresence/);
  assert.match(diagram, /motion\.aside/);
  assert.match(diagram, /height: "auto"/);
  assert.match(diagram, /shadow-none/);
});

test("frontend contract: repeated page controls reuse shared UI primitives", () => {
  const desktopUpdate = source(DESKTOP_UPDATE_CONTROL);
  const codeBlockLayer = source(CANVAS_CODE_BLOCK_LAYER);
  assert.match(source(CANVAS_CHROME), /<IconButton/);
  assert.match(source(QUICK_OPEN), /<Input/);
  assert.match(source(TOAST_PROVIDER), /<Button/); assert.match(source(TOAST_PROVIDER), /<IconButton/);
  assert.match(source(WORKSPACE_LIBRARY), /<Button/); assert.match(source(SIDEBAR), /<Button/);
  assert.match(source(QUICK_OPEN), /<Button/); assert.match(source(DIAGRAM_PALETTE), /<Button/);
  assert.match(desktopUpdate, /from "\.\.\/\.\.\/\.\.\/shared\/ui"/); assert.match(desktopUpdate, /<IconButton/); assert.match(desktopUpdate, /<Button/);
  assert.match(desktopUpdate, /\[box-shadow:var\(--shadow-popup\)\]/); assert.doesNotMatch(desktopUpdate, /<button/);
  assert.match(codeBlockLayer, /className="[^"]*size-7[^"]*focus-visible:outline-2[^"]*"[\s\S]{0,240}aria-label="Clear code output"/);
   assert.match(source(PAGE_SHELL), /Hide Explorer|Show Explorer/); assert.match(source(PAGE_SHELL), /NotespaceLogo/); assert.match(source(PAGE_SHELL), /aria-label="Search Notespace"/); assert.doesNotMatch(source(PAGE_SHELL), /PanelLeft/); assert.match(source(PAGE_SHELL), /<SettingsTrigger[\s\S]*showLabel/); assert.doesNotMatch(source(SIDEBAR), /OPEN_QUICK_SEARCH_EVENT/); assert.match(source(QUICK_OPEN), /OPEN_QUICK_SEARCH_EVENT/); assert.match(source(QUICK_OPEN), /event\.metaKey \|\| event\.ctrlKey/); assert.doesNotMatch(source(DASHBOARD), /ActivityDashboard|afterList/); assert.match(source(WORKSPACE_LIBRARY), /aspect-square/); assert.match(source(WORKSPACE_LIBRARY), /article className="[^"]*bg-accent/); assert.match(source(WORKSPACE_LIBRARY), /bg-surface\/75 backdrop-blur-lg/); assert.doesNotMatch(source(WORKSPACE_LIBRARY), /bg-tint\/95|Updated recently|<h2 className="m-0 text-xs font-semibold text-ink">Workspaces<\/h2>/);
  assert.doesNotMatch(source(WORKSPACE_LIBRARY), /aria-label="Library views"/);
  assert.match(source(WORKSPACE_LIBRARY), /<ContextMenu>/); assert.match(source(WORKSPACE_LIBRARY), /Edit title/); assert.match(source(WORKSPACE_LIBRARY_MODEL), /deleteWorkspace/); assert.match(source(WORKSPACE_LIBRARY), /<ConfirmDialog/);
  assert.match(source(SKELETON), /animate-soft-pulse/); assert.match(source(WORKSPACE_LIST_SKELETON), /Loading workspaces/);
  assert.match(source(WORKSPACE_LIBRARY), /<WorkspaceListSkeleton/);
});

test("layout archetypes: Home and category share cards with server-backed pagination", () => {
  const shell = source(PAGE_SHELL);
  const library = source(WORKSPACE_LIBRARY);
  const model = source(WORKSPACE_LIBRARY_MODEL);
  assert.match(source(DASHBOARD), /<LibraryPageShell/);
  assert.match(shell, /<HeaderPlacement/);
  assert.match(shell, /id="notespace-home-sidebar"/);
  assert.doesNotMatch(shell, /<ShellRail|Close category explorer/);
  assert.doesNotMatch(source(SIDEBAR), /notespace-sidebar-brand/);
  assert.doesNotMatch(source(SIDEBAR), /isSelected && "bg-tint"|isSelected && "font-semibold"|isSelected && "text-accent"/);
  assert.match(source(SIDEBAR), /notespace-active-workspace/);
  assert.match(source(PAGE_SHELL), /OPEN_QUICK_SEARCH_EVENT/);
  assert.doesNotMatch(library, /aria-label="Search category workspaces"|aria-label="Sort category workspaces"/);
  assert.match(library, /<NewWorkspaceCard/);
  assert.match(source(PAGE_SHELL), /<SettingsTrigger/);
  assert.match(source(PAGE_SHELL), /SettingsTrigger/);
  assert.doesNotMatch(source(DASHBOARD), /WorkspaceGuide/);
  assert.match(model, /listCategoryWorkspaces\(selectedCategoryId, \{ \.\.\.categoryPageState, limit: 50, snapshot \}\)/);
  assert.match(model, /categorySnapshotRef\.current/);
  assert.match(model, /pageRequestGeneration\.current === generation/);
  assert.match(library, /role="group" aria-label=\{view === "category" \? "Category workspaces" : "All workspaces"\}/);
  assert.doesNotMatch(library, /CategoryWorkspaceRow/);
});

test("frontend styling contract: application surfaces are utility-first", () => {
  for (const file of [ROUTE_PENDING, DASHBOARD, PAGE_SHELL, WORKSPACE_LIBRARY, SIDEBAR, LIBRARY_TOOLS, WORKSPACE, CANVAS, CANVAS_CHROME, CANVAS_SELECTION_ACTIONS, TOAST_PROVIDER]) {
    const content = source(file);
    assert.match(content, /className=/, `Tailwind classes missing from ${file}`);
    assert.doesNotMatch(content, /import\s+["']\.\.?\/[^"']+\.css["']/, `feature CSS import remains in ${file}`);
  }
});

test("frontend styling contract: removed feature stylesheets do not return", () => {
  for (const path of [join(WEB_SRC,"components","ui","ui.css"),join(WEB_SRC,"components","layout","sidebar.css"),join(WEB_SRC,"features","dashboard","dashboard.css"),join(WEB_SRC,"features","category","category-detail.css"),join(WEB_SRC,"features","workspace","workspace.css"),join(WEB_SRC,"features","study","study.css"),join(WEB_SRC,"components","feedback","route-pending.css"),join(WEB_SRC,"providers","toast.css"),join(WEB_SRC,"integrations","document","document-editor.css"),join(WEB_SRC,"integrations","canvas","canvas-editor.css")]) assert.equal(existsSync(path), false, `${path} must stay removed`);
});

test("design contract: loading, toast, and editor motion remain accessible", () => {
  const pending=source(ROUTE_PENDING), toast=source(TOAST_PROVIDER), globals=source(GLOBALS), packageJson=source(WEB_PACKAGE);
  assert.match(pending,/role="status"/); assert.match(pending,/aria-live="polite"/); assert.match(pending,/aria-busy="true"/); assert.match(pending,/NotespaceLogo/); assert.match(pending,/showWordmark={false}/); assert.match(pending,/animate-loading-logo/); assert.match(pending,/Preparing your workspace/); assert.doesNotMatch(pending,/progressbar|animate-loading-ring|Preparing your space|Your notes, canvas/); assert.doesNotMatch(pending,/hover:scale/); assert.match(globals,/prefers-reduced-motion/); assert.match(globals,/loading-logo/); assert.match(globals,/loading-mark/); assert.match(globals,/loading-ring/);
  assert.doesNotMatch(toast,/ToastPrimitive|@radix-ui\/react-toast/); assert.match(toast,/role=\{kind === "error" \? "alert" : "status"\}/); assert.match(toast,/aria-live=\{kind === "error" \? "assertive" : "polite"\}/); assert.match(toast,/aria-label="Dismiss notification"/); assert.match(toast,/MAX_VISIBLE_TOASTS/); assert.match(toast,/ToastGlyph/); assert.doesNotMatch(toast,/requestExclusivePopup/); assert.doesNotMatch(packageJson,/@radix-ui\/react-toast/);
});

test("design contract: no decorative gradients, neon motifs, or legacy Project copy", () => {
  const content=collectFiles(WEB_SRC,[".tsx"]).map(source).join("\n"); assert.doesNotMatch(`${source(GLOBALS)}\n${source(AUTHORING_STYLES)}\n${content}`,/linear-gradient|radial-gradient|conic-gradient/i); assert.doesNotMatch(content,/#(00ff00|ff00ff|00ffff|ff0033)/i); assert.doesNotMatch(content,/[\u2728\u{1FA84}]/u); assert.doesNotMatch(content,/ai-powered|magic wand|smart assistant/i);
  for (const pattern of [/Project not found/i,/Back to projects/i,/No projects yet/i,/New project/i,/Delete project/i,/Rename project/i]) assert.doesNotMatch(content,pattern);
});

test("global utility contract: Quick Capture and Activity UI are retired without deleting recovery data", () => {
  const sidebar=source(SIDEBAR), root=source(ROOT_ROUTE), shell=source(PAGE_SHELL);
  assert.equal(existsSync(RETIRED_SHELL_RAIL), false);
  assert.equal(existsSync(RETIRED_QUICK_CAPTURE), false);
  assert.match(shell, /id="notespace-home-sidebar"/);
  assert.match(source(PAGE_SHELL), /OPEN_QUICK_SEARCH_EVENT/);
  assert.match(root, /<QuickOpen \/>/);
  assert.match(root, /renderLibraryTools=\{/);
  assert.doesNotMatch(root, /<ActivityDock|<ActivityRuntimeProvider|QuickCapture/);
   assert.doesNotMatch(sidebar, /QuickCapture|OPEN_QUICK_SEARCH_EVENT/); assert.match(shell, /<SettingsTrigger[\s\S]*showLabel/); assert.match(shell, /aria-label="Search Notespace"/);
  // The whole web Activity/Capture feature is retired; only server data remains.
  assert.equal(existsSync(RETIRED_ACTIVITY_FEATURE), false);
  assert.equal(existsSync(RETIRED_CAPTURE_FEATURE), false);
});

test("Canvas-only Workspace removes the retired Note authoring surface", () => {
  const workspace=source(WORKSPACE), workspacePage=source(WORKSPACE_PAGE), content=source(WORKSPACE_CONTENT), canvas=source(CANVAS);
  assert.match(workspacePage, /<LibraryPageShell canvas/);
  assert.match(workspace, /<CanvasEditor/);
  assert.match(workspace, /useBlocker/);
  assert.match(workspace, /registerDesktopFlush\(flushAll\)/);
  assert.match(workspace, /await flushAll\(\)/);
  assert.doesNotMatch(workspace, /DocumentEditor|selectedNote|onOpenNote|createWorkspaceNote|deleteWorkspaceNote/);
  assert.doesNotMatch(canvas, /CanvasNoteArtifact|NotePicker|noteOpen|onOpenNote/);
  assert.doesNotMatch(workspace, /splitPane|resizeSplit|WorkspaceViewSwitcher|useWorkspacePaneLayout/);
  assert.doesNotMatch(workspacePage, /WorkspaceRail|ActivityIndicator|Focus mode/);
  assert.doesNotMatch(source(ROOT_ROUTE), /<ActivityDock/);
  assert.match(content, /notes: \[\]/);
  assert.equal(existsSync(DOCUMENT_EDITOR), false);
  assert.equal(existsSync(DOCUMENT_SLASH_COMMANDS), false);
  assert.equal(existsSync(NOTE_CODE_BLOCK), false);
});

test("asset contract: server is durable owner and IndexedDB is only a compatibility cache", () => {
  const canvas=source(CANVAS), store=source(IMAGE_ASSETS), core=source(IMAGE_ASSET_CORE), api=source(IMAGE_ASSET_API), cache=source(IMAGE_ASSET_CACHE), packageJson=source(WEB_PACKAGE);
  assert.match(packageJson,/"@excalidraw\/excalidraw":/); assert.match(canvas,/restoreLocalFiles/); assert.match(canvas,/persistCanvasFiles/);
  assert.match(api,/\/api\/workspaces\/\$\{encodeURIComponent\(workspaceId\)\}\/assets/); assert.match(api,/method:\s*"PUT"/); assert.match(api,/loadRemoteImageAsset/); assert.match(store,/createImageStore/); assert.match(core,/deps\.readLocal/); assert.match(core,/deps\.uploadRemote/); assert.match(cache,/indexedDB\.open\(DATABASE_NAME/); assert.match(core,/inFlightLoads/);
});

test("interaction contract: contextual popups still share one dismissal model", () => {
  const dismissable = source(DISMISSABLE_POPUP);
  assert.match(dismissable, /pointerdown/);
  assert.match(dismissable, /focusin/);
  assert.match(dismissable, /Escape/);
  assert.match(dismissable, /requestExclusivePopup/);
  assert.doesNotMatch(source(TOAST_PROVIDER), /requestExclusivePopup/);
  assert.match(source(CONFIRM_DIALOG), /useExclusivePopup\(open/);
  assert.match(source(CANVAS_SELECTION_ACTIONS), /useDismissablePopup\(rootRef/);
  assert.match(source(QUICK_OPEN), /<Dialog open=\{open\} onOpenChange=\{setOpen\}>/);
  assert.match(source(PAGE_SHELL), /new Event\(OPEN_QUICK_SEARCH_EVENT\)/);
});

test("runtime and identity contracts remain intact", () => { assert.match(source(ROUTER),/defaultPreload:\s*import\.meta\.env\.DEV\s*\?\s*false\s*:\s*"intent"/); assert.match(source(ROOT_ROUTE),/href: "\/favicon\.svg"/); assert.match(source(FAVICON).toLowerCase(),/#2858d8/); });
