import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const DESIGN = join(ROOT, "DESIGN.md");
const WEB = join(ROOT, "apps", "web");
const WEB_SRC = join(WEB, "src");
const GLOBALS = join(WEB_SRC, "styles", "globals.css");
const ROOT_ROUTE = join(WEB_SRC, "routes", "__root.tsx");
const ROUTE_PENDING = join(WEB_SRC, "components", "feedback", "RoutePending.tsx");
const DASHBOARD = join(WEB_SRC, "features", "dashboard", "Dashboard.tsx");
const CATEGORY_DETAIL = join(WEB_SRC, "features", "category", "CategoryDetail.tsx");
const SIDEBAR = join(WEB_SRC, "components", "layout", "Sidebar.tsx");
const QUICK_CAPTURE = join(WEB_SRC, "features", "capture", "QuickCapture.tsx");
const QUICK_OPEN = join(WEB_SRC, "features", "search", "QuickOpen.tsx");
const LIBRARY_TOOLS = join(WEB_SRC, "features", "library", "LibraryTools.tsx");
const WORKSPACE = join(WEB_SRC, "features", "workspace", "Workspace.tsx");
const PANE_LAYOUT = join(WEB_SRC, "features", "workspace", "pane-layout.ts");
const WORKSPACE_CONTENT = join(WEB_SRC, "features", "workspace", "workspace-content.ts");
const DOCUMENT_EDITOR = join(WEB_SRC, "integrations", "document", "DocumentEditor.tsx");
const CANVAS = join(WEB_SRC, "integrations", "canvas", "CanvasEditor.tsx");
const CANVAS_TOOLBAR = join(WEB_SRC, "integrations", "canvas", "CanvasToolbar.tsx");
const CANVAS_PANEL_POSITION = join(WEB_SRC, "integrations", "canvas", "CanvasPanelPosition.ts");
const DIAGRAM_PALETTE = join(WEB_SRC, "features", "diagram", "DiagramPalette.tsx");
const TOAST_PROVIDER = join(WEB_SRC, "providers", "toast-provider.tsx");
const STUDY_ACTIVITY = join(WEB_SRC, "features", "study", "StudyActivityDashboard.tsx");
const STUDY_INDICATOR = join(WEB_SRC, "features", "study", "StudyIndicator.tsx");
const SKELETON = join(WEB_SRC, "components", "ui", "skeleton.tsx");
const WORKSPACE_LIST_SKELETON = join(WEB_SRC, "components", "feedback", "WorkspaceListSkeleton.tsx");
const DISMISSABLE_POPUP = join(WEB_SRC, "components", "ui", "dismissable.tsx");
const CONFIRM_DIALOG = join(WEB_SRC, "components", "ui", "confirm-dialog.tsx");
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
  assert.match(globals, /--accent:\s*#4f7396/i); assert.match(globals, /--tint:\s*#e8eef6/i); assert.match(globals, /--font-sans/);
});

test("frontend styling contract: Tailwind v4 uses the official Vite and CSS-first setup", () => {
  const packageJson = source(WEB_PACKAGE); const vite = source(VITE_CONFIG); const globals = source(GLOBALS);
  assert.match(packageJson, /"tailwindcss":/); assert.match(packageJson, /"@tailwindcss\/vite":/);
  assert.match(vite, /import tailwindcss from "@tailwindcss\/vite"/); assert.match(vite, /tailwindcss\(\)/); assert.match(globals, /@import "tailwindcss";/); assert.match(globals, /@theme/);
  assert.doesNotMatch(globals, /@tailwind\s+(base|components|utilities)/); assert.doesNotMatch(globals, /@config\s+/); assert.equal(existsSync(join(WEB, "tailwind.config.ts")), false);
});

test("frontend styling contract: globals.css is the only app-authored stylesheet", () => {
  assert.deepEqual(collectFiles(WEB_SRC, [".css"]), [GLOBALS]); assert.match(source(ROOT_ROUTE), /import "\.\.\/styles\/globals\.css";/);
  for (const file of collectFiles(WEB_SRC, [".ts", ".tsx"])) { if (file === ROOT_ROUTE) continue; assert.doesNotMatch(source(file), /import\s+["']\.\.?\/[^"']+\.css["']/, `feature stylesheet import remains in ${file}`); }
  assert.match(source(CANVAS), /import "@excalidraw\/excalidraw\/index\.css";/);
});

test("frontend styling contract: globals owns tokens and document defaults, not feature selectors", () => {
  const globals = source(GLOBALS);
  const documentDefaults = globals.replace(/\/\* Excalidraw adapter:[\s\S]*?\.Toast\s*\{[\s\S]*?\n\}/, "");
  assert.match(globals, /--accent:\s*#4f7396/i); assert.match(globals, /--tint:\s*#e8eef6/i); assert.match(globals, /--accent:\s*#7fa6c9/i); assert.match(globals, /--tint:\s*#1b2636/i); assert.match(globals, /@layer base/); assert.match(globals, /prefers-reduced-motion/);
  for (const selector of [/\.sidebar\b/, /\.dashboard\b/, /\.tiptap\b/, /\.pane-resizer\b/, /\.toast-viewport\b/, /\.workspace-main\b/]) assert.doesNotMatch(documentDefaults, selector, `feature selector ${selector} leaked into globals.css`);
});

test("canvas contract: Excalidraw UI is scoped to Notespace tokens and one owned toolbar", () => {
  const globals = source(GLOBALS); const canvas = source(CANVAS); const toolbar = source(CANVAS_TOOLBAR);
  assert.match(globals, /\.notespace-canvas-surface \.excalidraw\s*\{/);
  assert.match(globals, /--color-primary:\s*var\(--accent\)/);
  assert.match(globals, /\.notespace-canvas-surface \.excalidraw \.App-toolbar/);
  assert.match(globals, /\.notespace-canvas-surface \.excalidraw \.App-menu_top/);
  assert.match(canvas, /className="notespace-canvas-surface/);
  assert.match(canvas, /absolute top-1\/2 left-2 z-\[100\] isolate -translate-y-1\/2/);
  assert.match(canvas, /<CanvasToolbar/);
  assert.match(canvas, /panelAnchorRef/);
  assert.match(canvas, /<CanvasUtilityBar/);
  assert.match(canvas, /<CanvasDetailsPanel/);
  assert.match(canvas, /onDoubleClick=\{openDetailsForDoubleClick\}/);
  assert.match(canvas, /selectedElementIds/);
  assert.equal((canvas.match(/anchorRef={panelAnchorRef}/g) ?? []).length, 2);
  assert.match(canvas, /CaptureUpdateAction\.IMMEDIATELY/);
  assert.match(toolbar, /function CanvasToolbarButton/);
  assert.match(toolbar, /<IconButton/);
  assert.match(toolbar, /!bg-tint !text-accent/);
  assert.match(toolbar, /aria-pressed={active}/);
  assert.match(toolbar, /aria-keyshortcuts=/);
  assert.match(toolbar, /createPortal/);
  assert.doesNotMatch(toolbar, /role="tooltip"/);
  assert.doesNotMatch(toolbar, /tooltipTimer|setTooltipOpen/);
  assert.match(toolbar, /shadow-none/);
  assert.match(toolbar, /Browse library/);
  assert.match(toolbar, /toggleSidebar/);
  assert.match(toolbar, /name: "default"/);
  assert.match(toolbar, /tab: "library"/);
  assert.doesNotMatch(toolbar, /name: "library"/);
  assert.match(toolbar, /fixed z-\[1000\]/);
  assert.match(toolbar, /anchorRef/);
  assert.match(toolbar, /ref={panelAnchorRef}/);
  assert.match(toolbar, /CanvasMorePanel anchorRef={panelAnchorRef}/);
  assert.match(toolbar, /useCanvasPanelPosition/);
  assert.match(toolbar, /AnimatePresence/);
  assert.match(toolbar, /motion\.aside/);
  assert.match(toolbar, /transition=\{canvasMotionTransition\}/);
  assert.match(toolbar, /ZoomIn/);
  assert.match(toolbar, /ZoomOut/);
  assert.doesNotMatch(toolbar, /<span[^>]*>Browse library<\/span>/);
  assert.doesNotMatch(toolbar, /<Link to="\/"/);
  assert.match(toolbar, /Fit canvas/);
  assert.match(toolbar, /z-10/);
  assert.match(toolbar, /primaryToolTypes/);
  assert.match(toolbar, /moreToolGroups/);
  assert.match(toolbar, /isToolSupported/);
  assert.match(toolbar, /More tools/);
  assert.match(toolbar, /canvasBackgroundOptions/);
  assert.match(toolbar, /aria-label="Canvas background colors"/);
  assert.match(toolbar, /Choose custom canvas background color/);
  assert.match(toolbar, /CanvasStylePanel/);
  assert.match(toolbar, /useCanvasPanelDismiss/);
  assert.match(toolbar, /onCoreToolSelect/);
  assert.match(toolbar, /label && <h3/);
  for (const styleState of ["currentItemStrokeColor", "currentItemBackgroundColor", "currentItemFillStyle", "currentItemStrokeWidthKey", "currentItemStrokeStyle", "currentItemRoughness", "currentItemRoundness", "currentItemOpacity", "currentItemStartArrowhead", "currentItemEndArrowhead", "currentItemFontFamily", "currentItemFontSize", "currentItemTextAlign"]) assert.match(toolbar, new RegExp(styleState));
  for (const styleSection of ["Fill", "Stroke width", "Stroke style", "Sloppiness", "Edges", "Opacity", "Arrowheads", "Arrow type", "Pressure", "Font size", "Text align"]) assert.match(toolbar, new RegExp(styleSection));
  assert.match(toolbar, /aria-label="Colors"/);
  assert.doesNotMatch(toolbar, /Text formatting/);
  for (const defaultAction of ["group", "ungroup", "bringToFront", "sendToBack", "alignLeft", "distributeHorizontally", "flipHorizontal", "copyStyles", "pasteStyles", "toggleElementLock", "wrapSelectionInFrame", "addToLibrary"]) assert.match(toolbar, new RegExp(`runAction\\(\\"${defaultAction}\\"\\)`));
  for (const directAction of ["gridMode", "objectsSnapMode", "zoomToFit"]) assert.match(toolbar, new RegExp(`onAction\\(\\"${directAction}\\"\\)`));
  for (const fileAction of ["copyAsPng", "copyAsSvg"]) assert.match(toolbar, new RegExp(`runAction\\(\\"${fileAction}\\"\\)`));
  assert.doesNotMatch(toolbar, /canvasDetailsSections|role="tablist"|role="tabpanel"/);
  assert.match(toolbar, /data-canvas-menu-trigger/);
  assert.match(toolbar, /onPointerEnter={openDiagram}/);
  assert.match(toolbar, /onPointerEnter={openDetails}/);
  assert.match(toolbar, /onPointerEnter={openMore}/);
  for (const action of ["Reset canvas", "Open", "Export image", "Copy as PNG", "Copy as SVG", "Save to file", "Command palette", "Find on canvas", "Help"]) assert.match(toolbar, new RegExp(`label=\\"${action.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\"`));
  assert.match(canvas, /name === "imageExport"/);
  assert.match(canvas, /openDialog: \{ name: "commandPalette" \}/);
  assert.match(canvas, /toggleSidebar\(\{ name: "default", tab: "search", force: !isSearchOpen \}\)/);
  assert.match(canvas, /actionManager\.actions\[name\]/);
  assert.match(canvas, /onBackgroundChange={setCanvasBackground}/);
  assert.doesNotMatch(canvas, /<MainMenu/);
  const diagram = source(DIAGRAM_PALETTE);
  assert.match(diagram, /useCanvasPanelPosition/);
  assert.match(diagram, /useCanvasPanelDismiss/);
  assert.doesNotMatch(diagram, /All Categories<\/div>/);
  assert.match(diagram, /createPortal/);
  assert.match(diagram, /fixed z-\[1000\]/);
  assert.match(diagram, /const showResults = hasSearch \|\| category !== "all"/);
  assert.match(diagram, /showResults &&/);
  assert.match(source(CANVAS_PANEL_POSITION), /belowSpace < height/);
  assert.match(source(CANVAS_PANEL_POSITION), /aboveSpace > belowSpace/);
  assert.match(source(CANVAS_PANEL_POSITION), /requestAnimationFrame/);
  assert.match(source(CANVAS_PANEL_POSITION), /ResizeObserver/);
  assert.match(diagram, /AnimatePresence/);
  assert.match(diagram, /motion\.aside/);
  assert.match(diagram, /height: "auto"/);
  assert.match(diagram, /shadow-none/);
});

test("frontend contract: repeated page controls reuse shared UI primitives", () => {
  assert.match(source(DOCUMENT_EDITOR), /<IconButton/); assert.match(source(DOCUMENT_EDITOR), /<Input/);
  assert.match(source(DOCUMENT_EDITOR), /\[scrollbar-width:none\]/); assert.match(source(DOCUMENT_EDITOR), /!justify-start/);
  assert.match(source(QUICK_CAPTURE), /<Input/); assert.match(source(QUICK_OPEN), /<Input/);
  assert.match(source(WORKSPACE), /<Button/); assert.match(source(WORKSPACE), /<IconButton/);
  assert.match(source(TOAST_PROVIDER), /<Button/); assert.match(source(TOAST_PROVIDER), /<IconButton/);
  assert.match(source(STUDY_ACTIVITY), /<Button/); assert.match(source(STUDY_INDICATOR), /<Button/);
  assert.match(source(DASHBOARD), /<Button/); assert.match(source(SIDEBAR), /<Button/);
  assert.match(source(QUICK_OPEN), /<Button/); assert.match(source(DIAGRAM_PALETTE), /<Button/);
  assert.match(source(DASHBOARD), /max-w-\[1120px\]/); assert.match(source(DASHBOARD), /<StudyActivityDashboard \/>/); assert.doesNotMatch(source(DASHBOARD), /<StudyActivityDashboard compact \/>/); assert.match(source(DASHBOARD), /min-h-20/); assert.match(source(DASHBOARD), /<h2 className="m-0 text-\[11px\] font-medium text-ink">Workspaces<\/h2>/);
  assert.match(source(STUDY_ACTIVITY), /rounded-lg border border-line bg-surface/); assert.match(source(STUDY_ACTIVITY), /auto-cols-\[12px\]/);
  assert.match(source(SKELETON), /animate-soft-pulse/); assert.match(source(WORKSPACE_LIST_SKELETON), /Loading workspaces/);
  assert.match(source(DASHBOARD), /<WorkspaceListSkeleton/); assert.match(source(CATEGORY_DETAIL), /<WorkspaceListSkeleton/);
});

test("frontend styling contract: application surfaces are utility-first", () => {
  for (const file of [ROUTE_PENDING, DASHBOARD, CATEGORY_DETAIL, SIDEBAR, QUICK_CAPTURE, LIBRARY_TOOLS, WORKSPACE, DOCUMENT_EDITOR, CANVAS, TOAST_PROVIDER, STUDY_ACTIVITY, STUDY_INDICATOR]) {
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

test("workspace contract: bounded panes use one interaction policy and Send/Link actions stay removed", () => {
  const workspace=source(WORKSPACE), layout=source(PANE_LAYOUT), content=source(WORKSPACE_CONTENT);
  assert.match(layout,/MAX_WORKSPACE_PANES = 4/);
  assert.match(layout,/function paneInteractionState/); assert.match(layout,/function paneFocusTarget/);
  assert.match(layout,/type WorkspaceViewMode = "canvas" \| "note" \| "split"/); assert.match(layout,/layoutForViewMode/); assert.match(layout,/workspaceViewMode/);
  assert.match(workspace,/data-testid="workspace-view-switcher"/); for (const mode of ["Canvas", "Note", "Split"]) assert.match(workspace, new RegExp(`"${mode}"`));
  assert.doesNotMatch(workspace,/Open Canvas|Open note|Close pane/);
  assert.match(workspace,/paneInteractionState\(layout/); assert.match(workspace,/paneFocusTarget\(layout/);
  assert.match(workspace,/pane\.kind === "note" \? "grid-rows-\[34px_minmax\(0,1fr\)\]"/);
  assert.match(workspace,/pane\.kind === "note" && <header/);
  assert.doesNotMatch(workspace,/Minimize2/);
  assert.doesNotMatch(workspace,/<Layers[^>]*\/> Canvas/);
  assert.doesNotMatch(workspace,/Send to Canvas|Send to Note|Link selected object|Link selected block|Go to linked/);
  assert.match(content,/references:\s*\[\]/);
});

test("asset contract: server is durable owner and IndexedDB is only a compatibility cache", () => {
  const canvas=source(CANVAS), editor=source(DOCUMENT_EDITOR), assets=source(IMAGE_ASSETS), packageJson=source(WEB_PACKAGE);
  assert.match(packageJson,/"@excalidraw\/excalidraw":/); assert.match(canvas,/restoreLocalFiles/); assert.match(canvas,/persistCanvasFiles/); assert.match(editor,/handlePaste:/); assert.match(editor,/storeImageAsset\(workspaceId, assetId/);
  assert.match(assets,/\/api\/workspaces\/\$\{encodeURIComponent\(workspaceId\)\}\/assets/); assert.match(assets,/method:\s*"PUT"/); assert.match(assets,/loadRemoteAsset/); assert.match(assets,/Read-through migration/); assert.match(assets,/indexedDB\.open\(DATABASE_NAME/);
});

test("interaction contract: contextual popups still share one dismissal model", () => {
  const dismissable=source(DISMISSABLE_POPUP); assert.match(dismissable,/pointerdown/); assert.match(dismissable,/focusin/); assert.match(dismissable,/Escape/); assert.match(dismissable,/requestExclusivePopup/); assert.match(source(TOAST_PROVIDER),/requestExclusivePopup\(\)/); assert.match(source(CONFIRM_DIALOG),/useExclusivePopup\(open/); assert.match(source(DASHBOARD),/useDismissablePopup\(searchRef/); assert.match(source(DOCUMENT_EDITOR),/useDismissablePopup\(documentRef/); assert.match(source(STUDY_INDICATOR),/useDismissablePopup\(indicatorRef/); assert.match(source(WORKSPACE),/useDismissablePopup\(historyDrawerRef/);
});

test("runtime and identity contracts remain intact", () => { assert.match(source(ROUTER),/defaultPreload:\s*import\.meta\.env\.DEV\s*\?\s*false\s*:\s*"intent"/); assert.match(source(ROOT_ROUTE),/href: "\/favicon\.svg"/); assert.match(source(FAVICON).toLowerCase(),/#4f7396/); });
