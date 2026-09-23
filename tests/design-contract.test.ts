import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const DESIGN = join(ROOT, "DESIGN.md");
const WEB = join(ROOT, "apps", "web");
const WEB_SRC = join(WEB, "src");
const GLOBALS = join(WEB_SRC, "styles", "globals.css");
const CONTROLS = join(WEB_SRC, "styles", "controls.css");
const ROOT_ROUTE = join(WEB_SRC, "routes", "__root.tsx");
const ROUTE_PENDING = join(WEB_SRC, "app", "feedback", "RoutePending.tsx");
const DASHBOARD = join(WEB_SRC, "pages", "home", "HomePage.tsx");
const SIDEBAR = join(WEB_SRC, "app", "shell", "Sidebar.tsx");
const QUICK_CAPTURE = join(WEB_SRC, "features", "capture", "QuickCapture.tsx");
const QUICK_OPEN = join(WEB_SRC, "features", "search", "QuickOpen.tsx");
const LIBRARY_TOOLS = join(WEB_SRC, "features", "library", "LibraryTools.tsx");
const WORKSPACE = join(WEB_SRC, "pages", "workspace", "WorkspacePage.tsx");
const WORKSPACE_PLAN = join(WEB_SRC, "features", "plan", "WorkspacePlan.tsx");
const INBOX = join(WEB_SRC, "pages", "inbox", "InboxPage.tsx");
const TODAY = join(WEB_SRC, "pages", "today", "TodayPage.tsx");
const PANE_LAYOUT = join(WEB_SRC, "features", "workspace", "pane-layout.ts");
const WORKSPACE_CONTENT = join(WEB_SRC, "features", "workspace", "workspace-content.ts");
const CANVAS_FRAME_LINK = join(WEB_SRC, "domain", "workspace", "canvas-frame-link.ts");
const DOCUMENT_EDITOR = join(WEB_SRC, "integrations", "document", "DocumentEditor.tsx");
const DOCUMENT_IMAGE_ACTIONS = join(WEB_SRC, "integrations", "document", "use-document-image-actions.ts");
const DOCUMENT_SLASH_COMMANDS = join(WEB_SRC, "integrations", "document", "document-slash-commands.ts");
const CANVAS_FRAME_LINK_NODE = join(WEB_SRC, "integrations", "document", "CanvasFrameLinkNode.tsx");
const CANVAS = join(WEB_SRC, "integrations", "canvas", "CanvasEditor.tsx");
const CANVAS_SCENE_STATE = join(WEB_SRC, "integrations", "canvas", "canvas-scene-state.ts");
const IMAGE_ASSET_URL = join(WEB_SRC, "integrations", "assets", "use-image-asset-url.ts");
const CANVAS_CHROME = join(WEB_SRC, "integrations", "canvas", "CanvasChrome.tsx");
const CANVAS_NATIVE_ACTIONS = join(WEB_SRC, "integrations", "canvas", "CanvasNativeActions.ts");
const CANVAS_SELECTION_ACTIONS = join(WEB_SRC, "integrations", "canvas", "CanvasSelectionActions.tsx");
const ANCHORED_PANEL = join(WEB_SRC, "shared", "ui", "anchored-panel.ts");
const CANVAS_PEER_CHANNEL = join(WEB_SRC, "integrations", "canvas", "use-canvas-peer-channel.ts");
const CANVAS_CODE_BLOCK = join(WEB_SRC, "integrations", "canvas", "canvas-code-block.ts");
const CANVAS_CODE_BLOCK_LAYER = join(WEB_SRC, "integrations", "canvas", "CanvasCodeBlockLayer.tsx");
const CANVAS_CODE_BLOCK_ACTIONS = join(WEB_SRC, "integrations", "canvas", "CanvasCodeBlockActions.tsx");
const CANVAS_CODE_BLOCK_MEASURE = join(WEB_SRC, "integrations", "canvas", "CanvasCodeBlockMeasure.tsx");
const CANVAS_CODE_BLOCK_LAYOUT = join(WEB_SRC, "integrations", "canvas", "canvas-code-block-layout.ts");
const CANVAS_CODE_RUNNER = join(WEB_SRC, "integrations", "canvas", "canvas-code-runner.ts");
const CANVAS_CODE_RUNNER_HOOK = join(WEB_SRC, "integrations", "canvas", "use-canvas-code-runner.ts");
const CODE_LANGUAGE = join(WEB_SRC, "domain", "code", "code-language.ts");
const CODE_RUNNER = join(WEB_SRC, "integrations", "code", "code-runner.ts");
const CODE_RUNNER_HOOK = join(WEB_SRC, "integrations", "code", "use-code-runner.ts");
const NOTE_CODE_BLOCK = join(WEB_SRC, "integrations", "document", "NoteCodeBlockNode.tsx");
const DIAGRAM_PALETTE = join(WEB_SRC, "features", "diagram", "DiagramPalette.tsx");
const TOAST_PROVIDER = join(WEB_SRC, "app", "providers", "toast-provider.tsx");
const STUDY_ACTIVITY = join(WEB_SRC, "features", "study", "StudyActivityDashboard.tsx");
const STUDY_INDICATOR = join(WEB_SRC, "features", "study", "StudyIndicator.tsx");
const ACTIVITY_RUNTIME = join(WEB_SRC, "features", "study", "activity-runtime-provider.tsx");
const ACTIVITY_RECOVERY = join(WEB_SRC, "features", "study", "activity-recovery.ts");
const ACTIVITY_DOCK = join(WEB_SRC, "features", "study", "ActivityDock.tsx");
const ACTIVITY_TYPE_MENU = join(WEB_SRC, "features", "study", "ActivityTypeMenu.tsx");
const ACTIVITY_TYPE_TRIGGER = join(WEB_SRC, "features", "study", "ActivityTypeTrigger.tsx");
const SKELETON = join(WEB_SRC, "shared", "ui", "skeleton.tsx");
const WORKSPACE_LIST_SKELETON = join(WEB_SRC, "features", "library", "WorkspaceListSkeleton.tsx");
const DISMISSABLE_POPUP = join(WEB_SRC, "shared", "ui", "dismissable.tsx");
const POPUP_SURFACE = join(WEB_SRC, "shared", "ui", "popup-surface.tsx");
const CONFIRM_DIALOG = join(WEB_SRC, "shared", "ui", "confirm-dialog.tsx");
const IMAGE_ASSETS = join(WEB_SRC, "domain", "assets", "local-image-assets.ts");
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
  assert.match(globals, /--accent:\s*#4f7396/i); assert.match(globals, /--tint:\s*#e8eef6/i); assert.match(globals, /--font-sans:\s*"Open Sans"/);
});

test("frontend styling contract: Tailwind v4 uses the official Vite and CSS-first setup", () => {
  const packageJson = source(WEB_PACKAGE); const vite = source(VITE_CONFIG); const globals = source(GLOBALS);
  assert.match(packageJson, /"tailwindcss":/); assert.match(packageJson, /"@tailwindcss\/vite":/);
  assert.match(vite, /import tailwindcss from "@tailwindcss\/vite"/); assert.match(vite, /tailwindcss\(\)/); assert.match(globals, /@import "tailwindcss";/); assert.match(globals, /@theme/);
  assert.doesNotMatch(globals, /@tailwind\s+(base|components|utilities)/); assert.doesNotMatch(globals, /@config\s+/); assert.equal(existsSync(join(WEB, "tailwind.config.ts")), false);
});

test("frontend styling contract: shared app styles stay limited to globals and controls", () => {
  const controls = source(CONTROLS);
  assert.deepEqual(collectFiles(WEB_SRC, [".css"]), [CONTROLS, GLOBALS]); assert.match(source(ROOT_ROUTE), /import "\.\.\/styles\/globals\.css";/);
  assert.match(controls, /input\[type="range"\]\[aria-label="Opacity"\][\s\S]*width:\s*62px;[\s\S]*flex:\s*0 0 62px/);
  for (const file of collectFiles(WEB_SRC, [".ts", ".tsx"])) { if (file === ROOT_ROUTE) continue; assert.doesNotMatch(source(file), /import\s+["']\.\.?\/[^"']+\.css["']/, `feature stylesheet import remains in ${file}`); }
  assert.match(source(CANVAS), /import "@excalidraw\/excalidraw\/index\.css";/);
});

test("frontend styling contract: globals owns tokens and document defaults, not feature selectors", () => {
  const globals = source(GLOBALS);
  const documentDefaults = globals.replace(/\/\* Excalidraw adapter:[\s\S]*?\.Toast\s*\{[\s\S]*?\n\}/, "");
  assert.match(globals, /--sidebar:\s*#fff/i); assert.match(globals, /--accent:\s*#4f7396/i); assert.match(globals, /--tint:\s*#e8eef6/i); assert.match(globals, /--accent:\s*#7fa6c9/i); assert.match(globals, /--tint:\s*#1b2636/i); assert.match(globals, /@layer base/); assert.match(globals, /prefers-reduced-motion/);
  for (const selector of [/\.sidebar\b/, /\.dashboard\b/, /\.tiptap\b/, /\.pane-resizer\b/, /\.toast-viewport\b/, /\.workspace-main\b/]) assert.doesNotMatch(documentDefaults, selector, `feature selector ${selector} leaked into globals.css`);
});

test("canvas contract: tool, contextual, and viewport chrome have distinct ownership", () => {
  const globals = source(GLOBALS), canvas = source(CANVAS), chrome = source(CANVAS_CHROME), nativeActions = source(CANVAS_NATIVE_ACTIONS), selection = source(CANVAS_SELECTION_ACTIONS), peerChannel = source(CANVAS_PEER_CHANNEL);
  assert.match(globals, /\.notespace-canvas-surface \.excalidraw\s*\{/);
  assert.match(globals, /--color-primary:\s*var\(--accent\)/);
  assert.match(globals, /\.notespace-canvas-surface \.excalidraw \.App-toolbar/);
  assert.match(globals, /\.notespace-canvas-surface \.excalidraw \.App-menu_top/);
  assert.match(globals, /\.notespace-canvas-surface \.mobile-shape-actions,/);
  assert.match(globals, /display:\s*none\s*!important/);
  assert.match(canvas, /className="notespace-canvas-surface/);
  assert.match(canvas, /<CanvasBottomChrome/);
  assert.match(chrome, /notespace-canvas-bottom-chrome/);
  assert.match(canvas, /<CanvasToolRail/);
  assert.match(canvas, /<CanvasViewControls/);
  assert.match(canvas, /<CanvasSelectionActions/);
  assert.doesNotMatch(canvas, /<CanvasToolbar|<CanvasUtilityBar|<CanvasDetailsPanel/);
  assert.doesNotMatch(canvas, /openDetailsForDoubleClick|onDoubleClick=/);
  assert.match(canvas, /selectedElementIds/);
  assert.match(canvas, /CaptureUpdateAction\.IMMEDIATELY/);
  assert.match(canvas, /name === "imageExport"/);
  assert.match(canvas, /openDialog: \{ name: "commandPalette" \}/);
  assert.match(canvas, /toggleSidebar\(\{ name: "default", tab: "search", force: !isSearchOpen \}\)/);
  assert.match(canvas, /actionManager\.actions\[name\]/);
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
  assert.doesNotMatch(codeLayer, /aria-label="Code language"|Run JavaScript|Copy code/); assert.match(codeLayer, /aria-label="Edit code block"/);
  assert.match(codeActions, /aria-label="Code block actions"/);
  assert.match(codeActions, /aria-label="Code language"/);
  assert.match(codeActions, /Run JavaScript/);
  assert.match(codeActions, /Fit code height/);
  assert.doesNotMatch(codeActions, /Edit code|Finish editing|Pencil/);
  assert.match(codeActions, /Copy code/);
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
  assert.match(codeRunner, /self\.fetch = \(\) => Promise\.reject/);
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
  assert.match(chrome, /canvasBackgroundOptions/);
  assert.match(chrome, /Browse library/);
  assert.match(chrome, /toggleSidebar/);
  assert.match(chrome, /tab === "library"/);
  assert.match(chrome, /useAnchoredPanelPosition/);
  assert.match(chrome, /useAnchoredPanelDismiss/);
  assert.match(chrome, /createPortal/);
  assert.match(chrome, /motion\.aside/);
  assert.match(chrome, /import \{ nativeActionIcon \} from "\.\/CanvasNativeActions"/);
  assert.doesNotMatch(chrome, /function nativeActionIcon|function NativeSvg|function NativeToolIcon/);
  assert.match(chrome, /name="zoomIn"/); assert.match(chrome, /name="zoomOut"/); assert.match(chrome, /Fit canvas/);
  assert.match(chrome, /onAction\("gridMode"\)/); assert.match(chrome, /onAction\("objectsSnapMode"\)/); assert.match(chrome, /onAction\("zoomToFit"\)/);
  assert.match(chrome, /name="undo" label="Undo"/); assert.match(chrome, /name="redo" label="Redo"/);
  assert.match(chrome, /max-\[560px\]:hidden/);
  assert.doesNotMatch(chrome, /min-\[561px\]:!size-10/);
  for (const group of ["Select", "Insert", "Present", "Paint", "Canvas", "File & export", "Navigate & help"]) assert.match(chrome, new RegExp(group.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (const action of ["Reset canvas", "Open", "Export image", "Copy as PNG", "Copy as SVG", "Save to file", "Command palette", "Find on canvas", "Help"]) assert.match(chrome, new RegExp(`label=\\"${action.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\"`));
  for (const redundant of ["duplicateSelection", "deleteSelectedElements", "bringToFront", "sendToBack", "alignLeft", "distributeHorizontally", "flipHorizontal", "toggleElementLock", "wrapSelectionInFrame", "addToLibrary"]) assert.doesNotMatch(chrome, new RegExp(redundant));

  assert.match(selection, /aria-label="Selected shape actions"/);
  assert.match(selection, /import \{ executeNativeAction, nativeActionIcon \} from "\.\/CanvasNativeActions"/);
  assert.doesNotMatch(selection, /function nativeActionIcon|function NativeIconFrame|function AdjustmentsIcon|function UndoIcon|function RedoIcon|function DuplicateIcon|function DeleteIcon/);
  assert.match(chrome, /CanvasBottomChrome/);
  assert.match(chrome, /notespace-canvas-bottom-chrome/);
  assert.match(selection, /analyzeCanvasSelection/);
  assert.match(selection, /onInteractionStateChange/);
  assert.doesNotMatch(selection, /More drawing options|Drawing styles/);
  assert.match(selection, /Interact with embed/);
  assert.match(selection, /activeEmbeddable/);
  assert.match(selection, /label="Layer"/);
  assert.match(selection, /label="Align & distribute"/);
  assert.match(selection, /w-fit max-w-full/);
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
  const popupSurface = source(POPUP_SURFACE);
  assert.match(popupSurface, /<motion\.div/); assert.match(popupSurface, /initial=\{\{ opacity: 0/); assert.match(popupSurface, /\[scrollbar-width:none\]/);
  assert.match(source(DOCUMENT_EDITOR), /<IconButton/); assert.match(source(DOCUMENT_EDITOR), /<Input/);
  assert.match(source(DOCUMENT_EDITOR), /\[scrollbar-width:none\]/); assert.match(source(DOCUMENT_EDITOR), /!justify-start/);
  assert.match(source(QUICK_CAPTURE), /<Input/); assert.match(source(QUICK_OPEN), /<Input/);
  assert.match(source(WORKSPACE), /<Button/); assert.match(source(WORKSPACE), /<IconButton/);
  assert.match(source(TOAST_PROVIDER), /<Button/); assert.match(source(TOAST_PROVIDER), /<IconButton/);
  assert.match(source(STUDY_ACTIVITY), /<Button/); assert.match(source(STUDY_INDICATOR), /<Button/);
  assert.match(source(DASHBOARD), /<Button/); assert.match(source(SIDEBAR), /<Button/);
  assert.match(source(QUICK_OPEN), /<Button/); assert.match(source(DIAGRAM_PALETTE), /<Button/);
  assert.match(source(DASHBOARD), /w-\[min\(320px,42vw\)\]/); assert.match(source(DASHBOARD), /OPEN_QUICK_SEARCH_EVENT/); assert.match(source(QUICK_OPEN), /OPEN_QUICK_SEARCH_EVENT/); assert.match(source(QUICK_OPEN), /event\.metaKey \|\| event\.ctrlKey/); assert.match(source(DASHBOARD), /<StudyActivityDashboard \/>/); assert.doesNotMatch(source(DASHBOARD), /<StudyActivityDashboard compact \/>/); assert.match(source(DASHBOARD), /aspect-square/); assert.match(source(DASHBOARD), /article className="[^"]*bg-accent/); assert.match(source(DASHBOARD), /bg-surface\/75 backdrop-blur-lg/); assert.doesNotMatch(source(DASHBOARD), /bg-tint\/95|Updated recently|<h2 className="m-0 text-xs font-semibold text-ink">Workspaces<\/h2>/);
  assert.match(source(DASHBOARD), /after:bg-accent/);
  assert.match(source(DASHBOARD), /<ContextMenu>/); assert.match(source(DASHBOARD), /Edit title/); assert.match(source(DASHBOARD), /deleteProject/); assert.match(source(DASHBOARD), /<ConfirmDialog/);
  assert.match(source(STUDY_ACTIVITY), /rounded-lg border border-line bg-surface/); assert.match(source(STUDY_ACTIVITY), /auto-cols-\[12px\]/);
  assert.match(source(SKELETON), /animate-soft-pulse/); assert.match(source(WORKSPACE_LIST_SKELETON), /Loading workspaces/);
  assert.match(source(DASHBOARD), /<WorkspaceListSkeleton/);
});

test("frontend styling contract: application surfaces are utility-first", () => {
  for (const file of [ROUTE_PENDING, DASHBOARD, SIDEBAR, QUICK_CAPTURE, LIBRARY_TOOLS, WORKSPACE, WORKSPACE_PLAN, INBOX, TODAY, DOCUMENT_EDITOR, CANVAS, CANVAS_CHROME, CANVAS_SELECTION_ACTIONS, TOAST_PROVIDER, STUDY_ACTIVITY, STUDY_INDICATOR, ACTIVITY_TYPE_MENU, ACTIVITY_TYPE_TRIGGER]) {
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
  assert.match(pending,/role="status"/); assert.match(pending,/aria-live="polite"/); assert.match(pending,/aria-busy="true"/); assert.match(pending,/NotespaceLogo/); assert.match(pending,/showWordmark={false}/); assert.match(pending,/animate-loading-logo/); assert.match(pending,/Preparing your workspace/); assert.doesNotMatch(pending,/progressbar|animate-loading-ring|Preparing your space|Your notes, canvas/); assert.match(globals,/prefers-reduced-motion/); assert.match(globals,/loading-logo/); assert.match(globals,/loading-mark/); assert.match(globals,/loading-ring/);
  assert.doesNotMatch(toast,/ToastPrimitive|@radix-ui\/react-toast/); assert.match(toast,/role=\{kind === "error" \? "alert" : "status"\}/); assert.match(toast,/aria-live=\{kind === "error" \? "assertive" : "polite"\}/); assert.match(toast,/aria-label="Dismiss notification"/); assert.match(toast,/animate-toast-progress/); assert.match(toast,/shadow-\[0_12px_32px_#0002\]/); assert.doesNotMatch(packageJson,/@radix-ui\/react-toast/);
});

test("design contract: no decorative gradients, neon motifs, or legacy Project copy", () => {
  const content=collectFiles(WEB_SRC,[".tsx"]).map(source).join("\n"); assert.doesNotMatch(`${source(GLOBALS)}\n${content}`,/linear-gradient|radial-gradient|conic-gradient/i); assert.doesNotMatch(content,/#(00ff00|ff00ff|00ffff|ff0033)/i); assert.doesNotMatch(content,/[\u2728\u{1FA84}]/u); assert.doesNotMatch(content,/ai-powered|magic wand|smart assistant/i);
  for (const pattern of [/Project not found/i,/Back to projects/i,/No projects yet/i,/New project/i,/Delete project/i,/Rename project/i]) assert.doesNotMatch(content,pattern);
});

test("capture contract: Quick Capture and Library Tools are direct sidebar actions", () => {
  const sidebar=source(SIDEBAR), capture=source(QUICK_CAPTURE), tools=source(LIBRARY_TOOLS), root=source(ROOT_ROUTE);
  assert.match(sidebar,/aria-label="New workspace"[\s\S]*<QuickCapture \/>[\s\S]*<LibraryTools \/>/);
  assert.match(capture,/aria-label="Quick capture"/); assert.match(capture,/Ctrl\/Cmd \+ Shift \+ N/);
  assert.match(capture,/listRecentWorkspaces\(recentWorkspaceLimit\)/); assert.match(capture,/listAllWorkspaces\(\{ query, limit: recentWorkspaceLimit \}\)/); assert.doesNotMatch(capture,/listProjects\(/); assert.doesNotMatch(capture,/searchNotespace\(/);
  assert.doesNotMatch(capture,/fixed bottom-4 right-4/); assert.doesNotMatch(root,/<QuickCapture \/>|<LibraryTools \/>/);
  assert.doesNotMatch(tools,/createPortal|MutationObserver|querySelector|useRouterState/);
});

test("workspace contract: bounded panes and explicit Canvas frame embeds remain user-facing behavior", () => {
  const workspace=source(WORKSPACE), layout=source(PANE_LAYOUT), content=source(WORKSPACE_CONTENT), editor=source(DOCUMENT_EDITOR), frameLink=source(CANVAS_FRAME_LINK), frameNode=source(CANVAS_FRAME_LINK_NODE);
  assert.match(layout,/MAX_WORKSPACE_PANES = 4/);
  assert.match(layout,/type WorkspaceViewMode = "canvas" \| "note" \| "split"/);
  const viewSwitcher = source(join(WEB_SRC, "features", "workspace", "WorkspaceViewSwitcher.tsx"));
  const renameField = source(join(WEB_SRC, "features", "workspace", "WorkspaceRenameField.tsx"));
  assert.match(viewSwitcher,/data-testid="workspace-view-switcher"/);
  assert.match(viewSwitcher,/bg-tint text-accent ring-1 ring-accent\/15/);
  assert.match(workspace,/renameProject/);
  assert.match(workspace,/Rename workspace/);
  assert.match(workspace,/onDoubleClick=\{\(event\) =>/);
  assert.doesNotMatch(workspace,/aria-label="Rename workspace"/);
  assert.match(workspace,/workspace-switcher/);
  assert.match(workspace,/role="listbox"/);
  assert.doesNotMatch(workspace,/<select /);
  assert.match(renameField,/aria-label="Workspace title"/);
  for (const mode of ["Canvas", "Note", "Split", "Plan"]) assert.match(viewSwitcher, new RegExp(`"${mode}"`));
  assert.match(workspace, /<WorkspacePlan/);
  assert.match(workspace, /onStartActivity=/);
  assert.match(source(WORKSPACE_PLAN), /Start activity for/);
  assert.match(source(WORKSPACE_PLAN), /ActivityTypeTrigger/);
  assert.match(source(WORKSPACE_PLAN), /Turn this workspace into concrete checkpoints and next actions/);
  assert.doesNotMatch(source(WORKSPACE_PLAN), /kanban|sprint|story points|assignee/i);
  assert.match(source(SIDEBAR), /to="\/inbox"/);
  assert.match(source(SIDEBAR), /to="\/today"/);
  assert.match(source(INBOX), /Capture first\. Decide when to do it later\./);
  assert.match(source(INBOX), /New inbox task/);
  assert.match(source(INBOX), /Move .* to Today/);
  assert.doesNotMatch(source(INBOX), /priority|kanban|milestone|recurrence|productivity score/i);
  assert.match(source(WORKSPACE_PLAN), /Add .* to Today/);
  assert.match(source(TODAY), /One place for the work you explicitly chose to do today/);
  assert.match(source(TODAY), /Standalone/);
  assert.match(source(TODAY), /Move .* to Inbox/);
  assert.match(source(TODAY), /What are you doing\?/);
  assert.match(source(TODAY), /Activity type/);
  assert.match(source(TODAY), /Start activity for/);
  assert.match(source(TODAY), /ActivityTypeTrigger/);
  assert.match(source(TODAY), /useActivityRuntime/);
  assert.match(source(TODAY), /getToday/);
  assert.match(source(TODAY), /taskRevision/);
  assert.doesNotMatch(source(TODAY), /useActivitySession|handoffResolving|completionConfirmed|activityStartBlocked/);
  assert.doesNotMatch(source(TODAY), /priority|kanban|habit|streak|productivity score/i);
  assert.match(source(STUDY_INDICATOR), /aria-label="Start activity"/);
  assert.match(source(STUDY_INDICATOR), /ActivityTypeMenu/);
  assert.doesNotMatch(source(STUDY_INDICATOR), /taskHandoff|onEnd|study\.pause|study\.resume|study\.end/);
  assert.match(workspace, /useActivityRuntime/);
  assert.match(workspace, /adoptLegacyWorkspace/);
  assert.match(workspace, /refreshKey=\{study\.taskRevision\}/);
  assert.doesNotMatch(workspace, /activityHandoff|getWorkspacePlan|completeActivityHandoffTask/);
  assert.match(source(ROOT_ROUTE), /ActivityRuntimeProvider/);
  assert.match(source(ROOT_ROUTE), /<ActivityDock \/>/);
  assert.match(source(ACTIVITY_RUNTIME), /getAnyTask/);
  assert.match(source(ACTIVITY_RUNTIME), /updateAnyTask/);
  assert.match(source(ACTIVITY_RUNTIME), /completionConfirmed/);
  assert.match(source(ACTIVITY_RUNTIME), /taskRevision/);
  assert.match(source(ACTIVITY_RUNTIME), /readActivityRecovery/);
  assert.match(source(ACTIVITY_RUNTIME), /recordActivityHeartbeat/);
  assert.match(source(ACTIVITY_RUNTIME), /ACTIVITY_RECOVERY_PENDING_EVENT/);
  assert.doesNotMatch(source(ACTIVITY_RUNTIME), /handoffBlocksStart/);
  assert.match(source(ACTIVITY_RECOVERY), /notespace\.activity-recovery:v1/);
  assert.match(source(ACTIVITY_RECOVERY), /enqueueActivityFinalization/);
  assert.match(source(ACTIVITY_RECOVERY), /acknowledgeActivityFinalization/);
  assert.match(source(ACTIVITY_RECOVERY), /handoffTaskIds/);
  assert.match(source(ACTIVITY_DOCK), /Task completion handoff/);
  assert.match(source(ACTIVITY_DOCK), /Mark task done\?/);
  assert.match(source(ACTIVITY_DOCK), /Mark done/);
  assert.match(source(ACTIVITY_DOCK), /Keep open/);
  assert.match(source(ACTIVITY_DOCK), /Pause activity/);
  assert.match(source(ACTIVITY_DOCK), /End activity/);
  assert.match(source(ACTIVITY_DOCK), /Activity sync/);
  assert.match(source(ACTIVITY_DOCK), /finalizingCount/);
  assert.match(source(ACTIVITY_TYPE_TRIGGER), /useAnchoredPanelPosition/);
  assert.match(source(ACTIVITY_TYPE_TRIGGER), /useAnchoredPanelDismiss/);
  assert.match(source(ACTIVITY_TYPE_TRIGGER), /createPortal/);
  assert.match(source(ACTIVITY_TYPE_TRIGGER), /ActivityTypeMenu/);
  assert.match(source(ACTIVITY_TYPE_MENU), /Choose activity type/);
  for (const type of ["Build", "Learn", "Read", "Write", "Exercise", "Other"]) {
    assert.match(source(ACTIVITY_TYPE_MENU), new RegExp(type));
  }
  assert.match(source(STUDY_ACTIVITY), />Activity<\/h2>/);
  assert.doesNotMatch(source(STUDY_ACTIVITY), /Streak|currentStreak/);
  assert.match(workspace,/>Close pane<\/Button>/);
  assert.doesNotMatch(workspace,/Send to Canvas|Send to Note|Link selected object|Link selected block|Go to linked/);
  assert.match(content,/references:\s*\[\]/);
  assert.match(workspace, /articleMode=\{articleMode\}/);
  assert.match(workspace, /getCanvasSnapshot=\{\(\) => current\.current\.canvas\}/);
  assert.match(workspace, /onOpenCanvasFrame=\{openCanvasFrame\}/);
  assert.match(workspace, /focusRequest=\{canvasFocus\}/);
  assert.match(editor, /max-w-\[760px\]/);
  assert.match(source(DOCUMENT_SLASH_COMMANDS), /label: "Link canvas"/);
  assert.match(source(DOCUMENT_SLASH_COMMANDS), /label: "Code block"/);
  assert.match(editor, /createNoteCodeBlockExtension/);
  assert.match(editor, /aria-label="Code block"/);
  const noteCodeBlock = source(NOTE_CODE_BLOCK);
  assert.match(noteCodeBlock, /data-note-code-block/);
  assert.match(noteCodeBlock, /detectCodeLanguage/);
  assert.match(noteCodeBlock, /useCodeRunner/);
  assert.match(noteCodeBlock, /Run JavaScript/);
  assert.match(noteCodeBlock, /codeThemeVariables/);
  assert.match(noteCodeBlock, /nextCodeTheme/);
  assert.match(noteCodeBlock, /theme: \{ default: "auto" \}/);
  assert.match(noteCodeBlock, /Code output/);
  assert.match(editor, /canvasFrameLinkFromClipboard/);
  assert.match(frameLink, /MAX_FRAME_PREVIEW_ELEMENTS = 160/);
  assert.match(frameNode, /data-canvas-frame-link/);
  assert.match(frameNode, /Open canvas frame/);
  assert.match(frameNode, /IntersectionObserver/);
  assert.match(frameNode, /data-canvas-frame-preview-deferred/);
  assert.match(source(IMAGE_ASSET_URL), /URL\.createObjectURL/);
  assert.match(source(IMAGE_ASSET_URL), /URL\.revokeObjectURL/);
});

test("asset contract: server is durable owner and IndexedDB is only a compatibility cache", () => {
  const canvas=source(CANVAS), editor=source(DOCUMENT_EDITOR), imageActions=source(DOCUMENT_IMAGE_ACTIONS), assets=source(IMAGE_ASSETS), packageJson=source(WEB_PACKAGE);
  assert.match(packageJson,/"@excalidraw\/excalidraw":/); assert.match(canvas,/restoreLocalFiles/); assert.match(canvas,/persistCanvasFiles/); assert.match(editor,/handlePaste:/); assert.match(imageActions,/storeImageAsset\(workspaceId, assetId/);
  assert.match(assets,/\/api\/workspaces\/\$\{encodeURIComponent\(workspaceId\)\}\/assets/); assert.match(assets,/method:\s*"PUT"/); assert.match(assets,/loadRemoteAsset/); assert.match(assets,/Read-through migration/); assert.match(assets,/indexedDB\.open\(DATABASE_NAME/); assert.match(assets,/inFlightAssetLoads/);
});

test("interaction contract: contextual popups still share one dismissal model", () => {
  const dismissable=source(DISMISSABLE_POPUP); assert.match(dismissable,/pointerdown/); assert.match(dismissable,/focusin/); assert.match(dismissable,/Escape/); assert.match(dismissable,/requestExclusivePopup/); assert.match(source(TOAST_PROVIDER),/requestExclusivePopup\(\)/); assert.match(source(CONFIRM_DIALOG),/useExclusivePopup\(open/); assert.match(source(DOCUMENT_EDITOR),/useDismissablePopup\(documentRef/); assert.match(source(STUDY_INDICATOR),/useDismissablePopup\(indicatorRef/); assert.match(source(ACTIVITY_TYPE_TRIGGER),/useAnchoredPanelPosition\(anchorRef/); assert.match(source(ACTIVITY_TYPE_TRIGGER),/useAnchoredPanelDismiss\(open/); assert.match(source(CANVAS_SELECTION_ACTIONS),/useDismissablePopup\(rootRef/); assert.match(source(QUICK_OPEN),/<Dialog open=\{open\} onOpenChange=\{setOpen\}>/); assert.match(source(DASHBOARD),/new Event\(OPEN_QUICK_SEARCH_EVENT\)/);
});

test("runtime and identity contracts remain intact", () => { assert.match(source(ROUTER),/defaultPreload:\s*import\.meta\.env\.DEV\s*\?\s*false\s*:\s*"intent"/); assert.match(source(ROOT_ROUTE),/href: "\/favicon\.svg"/); assert.match(source(FAVICON).toLowerCase(),/#4f7396/); });
