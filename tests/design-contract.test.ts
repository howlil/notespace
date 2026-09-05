import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const WEB = join(ROOT, "apps", "web");
const WEB_SRC = join(WEB, "src");
const WEB_PACKAGE = join(WEB, "package.json");
const VITE_CONFIG = join(WEB, "vite.config.ts");
const TAILWIND_CONFIG = join(WEB, "tailwind.config.ts");
const GLOBALS = join(WEB_SRC, "styles", "globals.css");
const ROUTE_PENDING = join(WEB_SRC, "components", "feedback", "RoutePending.tsx");
const ROUTER = join(WEB_SRC, "router.tsx");
const DASHBOARD = join(WEB_SRC, "features", "dashboard", "Dashboard.tsx");
const CATEGORY_DETAIL = join(WEB_SRC, "features", "category", "CategoryDetail.tsx");
const STUDY_ACTIVITY = join(WEB_SRC, "features", "study", "StudyActivityDashboard.tsx");
const STUDY_INDICATOR = join(WEB_SRC, "features", "study", "StudyIndicator.tsx");
const SIDEBAR = join(WEB_SRC, "components", "layout", "Sidebar.tsx");
const WORKSPACE = join(WEB_SRC, "features", "workspace", "Workspace.tsx");
const DOCUMENT_EDITOR = join(WEB_SRC, "integrations", "document", "DocumentEditor.tsx");
const CANVAS = join(WEB_SRC, "integrations", "canvas", "CanvasEditor.tsx");
const LOCAL_IMAGE_ASSETS = join(WEB_SRC, "domain", "assets", "local-image-assets.ts");
const ROOT_ROUTE = join(WEB_SRC, "routes", "__root.tsx");
const TOAST_PROVIDER = join(WEB_SRC, "providers", "toast-provider.tsx");
const DISMISSABLE_POPUP = join(WEB_SRC, "components", "ui", "dismissable.tsx");
const CONFIRM_DIALOG = join(WEB_SRC, "components", "ui", "confirm-dialog.tsx");
const FAVICON = join(WEB, "public", "favicon.svg");
const UI_COMPONENTS = join(WEB_SRC, "components", "ui");
const LEGACY_APP = join(WEB_SRC, "app");

function collectFiles(dir: string, ext: string[]): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) results.push(...collectFiles(full, ext));
    else if (ext.some((suffix) => entry.endsWith(suffix))) results.push(full);
  }
  return results;
}

function source(file: string) { return readFileSync(file, "utf8"); }
function allTsx() { return collectFiles(WEB_SRC, [".tsx"]).map(source).join("\n"); }

test("architecture contract: frontend uses current Tailwind v4 through the official Vite plugin", () => {
  const packageJson = source(WEB_PACKAGE);
  const vite = source(VITE_CONFIG);
  const css = source(GLOBALS);

  assert.match(packageJson, /"tailwindcss":\s*"\^4\.3\.3"/);
  assert.match(packageJson, /"@tailwindcss\/vite":\s*"\^4\.3\.3"/);
  assert.match(vite, /import tailwindcss from "@tailwindcss\/vite"/);
  assert.match(vite, /tailwindcss\(\)/);
  assert.match(css, /@import "tailwindcss";/);
  assert.match(css, /@theme/);
  assert.doesNotMatch(css, /@tailwind\s+(base|components|utilities)/);
  assert.doesNotMatch(css, /@config\s+/);
  assert.equal(existsSync(TAILWIND_CONFIG), false, "Tailwind v3 config file must not return");
});

test("architecture contract: globals.css is the only app-authored stylesheet", () => {
  const cssFiles = collectFiles(WEB_SRC, [".css"]);
  assert.deepEqual(cssFiles, [GLOBALS]);

  for (const file of collectFiles(WEB_SRC, [".tsx", ".ts"])) {
    const content = source(file);
    assert.doesNotMatch(content, /import\s+["']\.\.?\/[^"']+\.css["']/, `relative app stylesheet import found in ${file}`);
  }

  const canvas = source(CANVAS);
  assert.match(canvas, /import "@excalidraw\/excalidraw\/index\.css";/, "Excalidraw's required vendor stylesheet must remain external");
});

test("design contract: globals.css owns tokens, base defaults, and shared animations only", () => {
  const css = source(GLOBALS);
  assert.match(css, /--accent:\s*#4f7396/i);
  assert.match(css, /--tint:\s*#e8eef6/i);
  assert.match(css, /--accent:\s*#7fa6c9/i);
  assert.match(css, /--tint:\s*#1b2636/i);
  assert.match(css, /@layer base/);
  assert.match(css, /--animate-loading-progress/);
  assert.match(css, /--animate-toast-progress/);
  assert.match(css, /prefers-reduced-motion/);
  for (const selector of [/\.sidebar\b/, /\.dashboard\b/, /\.tiptap\b/, /\.pane-resizer\b/, /\.toast-viewport\b/, /\.workspace-main\b/]) {
    assert.doesNotMatch(css, selector, `feature selector ${selector} leaked into globals.css`);
  }
});

test("design contract: feature surfaces express layout and states with Tailwind utilities", () => {
  const files = [ROUTE_PENDING, DASHBOARD, CATEGORY_DETAIL, STUDY_ACTIVITY, STUDY_INDICATOR, SIDEBAR, WORKSPACE, DOCUMENT_EDITOR, CANVAS, TOAST_PROVIDER];
  for (const file of files) {
    const content = source(file);
    assert.match(content, /className=/, `expected utility styling in ${file}`);
    assert.doesNotMatch(content, /import\s+["']\.\.?\/[^"']+\.css["']/, `feature CSS import remains in ${file}`);
  }

  assert.match(source(WORKSPACE), /after:bg-\[color-mix\(/);
  assert.match(source(DOCUMENT_EDITOR), /\[&_blockquote\]:border-0/);
  assert.match(source(CANVAS), /\[&_\.App-toolbar\]/);
  assert.match(source(TOAST_PROVIDER), /animate-toast-progress/);
});

test("design contract: entry loading state is informative and motion-safe", () => {
  const pending = source(ROUTE_PENDING);
  const css = source(GLOBALS);
  assert.match(pending, /role="status"/);
  assert.match(pending, /Preparing your workspace/);
  assert.match(pending, /animate-loading-progress/);
  assert.match(css, /--animate-loading-progress/);
  assert.match(css, /prefers-reduced-motion/);
});

test("runtime contract: dev router does not start abort-prone intent preloads", () => {
  assert.match(source(ROUTER), /defaultPreload:\s*import\.meta\.env\.DEV\s*\?\s*false\s*:\s*"intent"/);
});

test("design contract: no decorative gradients, neon motifs, or AI marketing copy", () => {
  const content = `${source(GLOBALS)}\n${allTsx()}`;
  assert.doesNotMatch(content, /linear-gradient|radial-gradient|conic-gradient/i);
  assert.doesNotMatch(content, /#(00ff00|ff00ff|00ffff|ff0033)/i);
  assert.doesNotMatch(content, /[\u2728\u{1FA84}]/u);
  assert.doesNotMatch(content, /ai-powered|magic wand|smart assistant/i);
});

test("design contract: no user-facing legacy Project copy in Category -> Workspace flow", () => {
  const content = allTsx();
  for (const pattern of [/Project not found/i, /Back to projects/i, /No projects yet/i, /New project/i, /Delete project/i, /Rename project/i]) {
    assert.doesNotMatch(content, pattern);
  }
});

test("design contract: library creation stays in the sidebar and input chrome remains quiet", () => {
  const dashboard = source(DASHBOARD);
  const sidebar = source(SIDEBAR);
  const category = source(CATEGORY_DETAIL);
  const workspace = source(WORKSPACE);

  assert.doesNotMatch(dashboard, /Knowledge, organized\.|Manage category|\+ New workspace/);
  assert.match(dashboard, /<ThemeToggle \/>/);
  assert.match(sidebar, /FolderPlus/);
  assert.match(sidebar, /FilePlus2/);
  assert.doesNotMatch(sidebar, /<ThemeToggle \/>/);
  assert.match(sidebar, /onContextMenu/);
  assert.match(sidebar, /onDoubleClick/);
  assert.match(sidebar, /requestSubmit/);
  assert.match(sidebar, /await deleteProject\(target\.item\.id\);[\s\S]*workspace\.id !== target\.item\.id/);
  assert.doesNotMatch(sidebar, /window\.confirm|window\.alert/);
  assert.match(sidebar, /inlineInputClass = "[^"]*border-0[^"]*bg-transparent/);
  assert.match(category, /New workspace[\s\S]*border-0 bg-transparent/);
  assert.match(workspace, /aria-label="Note title"[\s\S]*border-0 bg-transparent|border-0 bg-transparent[\s\S]*aria-label="Note title"/);
  assert.doesNotMatch(source(GLOBALS), /input:focus-visible\s*\{[^}]*outline:\s*2px/i);
});

test("architecture contract: legacy app surface and feature CSS stay removed", () => {
  assert.equal(existsSync(LEGACY_APP), false);
  for (const path of [
    join(WEB_SRC, "components", "ui", "ui.css"),
    join(WEB_SRC, "components", "layout", "sidebar.css"),
    join(WEB_SRC, "features", "dashboard", "dashboard.css"),
    join(WEB_SRC, "features", "category", "category-detail.css"),
    join(WEB_SRC, "features", "workspace", "workspace.css"),
    join(WEB_SRC, "features", "study", "study.css"),
    join(WEB_SRC, "components", "feedback", "route-pending.css"),
    join(WEB_SRC, "providers", "toast.css"),
    join(WEB_SRC, "integrations", "document", "document-editor.css"),
    join(WEB_SRC, "integrations", "canvas", "canvas-editor.css"),
  ]) assert.equal(existsSync(path), false, `${path} must stay removed`);
});

test("UI contract: a new workspace opens Note and Canvas with a quiet resizable split", () => {
  const workspace = source(WORKSPACE);
  const documentEditor = source(DOCUMENT_EDITOR);

  assert.match(workspace, /function defaultLayout[\s\S]*kind: "split"[\s\S]*kind: "canvas"/);
  assert.match(workspace, /after:bg-\[color-mix\(in_srgb,var\(--line\)_72%,transparent\)\]/);
  assert.match(workspace, /max-\[760px\]:!grid-cols-1/);
  assert.match(workspace, /flex h-auto min-h-0 flex-1 overflow-hidden/);
  assert.match(workspace, /focusMode = Boolean\(maximizedPaneId \|\| maximizedSplitId\)/);
  assert.match(workspace, /focusMode && "hidden"/);
  assert.match(workspace, /z-55/);
  assert.match(workspace, /pane-content-context flex h-full min-h-0/);
  assert.match(workspace, /function selectionContext/);
  assert.match(workspace, /Send to Canvas/);
  assert.match(workspace, /Send to Note/);
  assert.match(workspace, /Link selected object to note/);
  assert.match(workspace, /Link selected block to Canvas/);
  assert.match(workspace, /function normalizeDocument/);
  assert.match(workspace, /attrs: \{ blockId \}/);
  assert.match(workspace, /function findContainingSplit/);
  assert.match(workspace, /maximizedSplitId/);
  assert.match(workspace, /function documentBlocks/);
  assert.match(workspace, /function linkCanvasToBlock/);

  assert.match(documentEditor, /class: editorClassName/);
  assert.match(documentEditor, /\[scrollbar-width:none\]/);
  assert.match(documentEditor, /\[&::-webkit-scrollbar\]:hidden/);
  assert.match(documentEditor, /\[&_blockquote\]:border-0/);
  assert.match(documentEditor, /Start_writing/);
});

test("UI contract: maximizing a split keeps the split layout available", () => {
  const workspace = source(WORKSPACE);
  assert.match(workspace, /function findSplit/);
  assert.match(workspace, /function maximizeSplit/);
  assert.match(workspace, /maximizedSplit \? renderNode\(maximizedSplit\)/);
  assert.match(workspace, /focusMode = Boolean\(maximizedPaneId \|\| maximizedSplitId\)/);
});

test("UI contract: root document registers the Notespace favicon", () => {
  const root = source(ROOT_ROUTE);
  const favicon = source(FAVICON);
  assert.match(root, /rel: "icon"/);
  assert.match(root, /href: "\/favicon\.svg"/);
  assert.match(favicon, /viewBox="0 0 64 64"/);
  assert.match(favicon, /#4f7396/);
});

test("UI contract: Canvas keeps the full Excalidraw tool and utility menu", () => {
  const canvas = source(CANVAS);
  const documentEditor = source(DOCUMENT_EDITOR);
  const localAssets = source(LOCAL_IMAGE_ASSETS);
  const packageJson = source(WEB_PACKAGE);

  assert.match(canvas, /loadScene:\s*true/);
  assert.match(canvas, /export:\s*\{\s*saveFileToDisk:\s*true\s*\}/);
  assert.match(canvas, /saveAsImage:\s*true/);
  assert.match(canvas, /tools:\s*\{\s*image:\s*true\s*,?\s*\}/);
  assert.match(canvas, /native bucket-fill tool/);
  assert.match(canvas, /onInitialize=\{onInitialize\}/);
  assert.match(canvas, /setViewport\(\{[\s\S]*target: element[\s\S]*fit: "scale-down"/);
  assert.match(packageJson, /"@excalidraw\/excalidraw":\s*"npm:@dwelle\/excalidraw@0\.5\.0-b276327"/);
  assert.match(canvas, /MainMenu\.DefaultItems\.CommandPalette/);
  assert.match(canvas, /MainMenu\.DefaultItems\.SearchMenu/);
  assert.match(canvas, /MainMenu\.DefaultItems\.Help/);
  assert.match(canvas, /restoreLocalFiles/);
  assert.match(canvas, /persistCanvasFiles/);
  assert.match(canvas, /files:\s*\{\}/);
  assert.match(documentEditor, /handlePaste:/);
  assert.match(documentEditor, /Highlight/);
  assert.match(documentEditor, /commands\.selectAll\(\)/);
  assert.match(documentEditor, /commands\.deleteSelection\(\)/);
  assert.match(documentEditor, /toggleHighlight\(\)/);
  assert.match(documentEditor, /storeImageAsset\(workspaceId, assetId/);
  assert.match(localAssets, /indexedDB\.open\(DATABASE_NAME/);
  assert.match(localAssets, /MAX_ASSET_BYTES = 8 \* 1024 \* 1024/);
});

test("stability contract: Excalidraw keeps one instance while Workspace state changes", () => {
  const canvas = source(CANVAS);
  assert.match(canvas, /const canvasUIOptions = \{/);
  assert.match(canvas, /const changed = useCallback\(/);
  assert.match(canvas, /const onInitialize = useCallback\(/);
  assert.match(canvas, /const lastExternalScene = useRef\(sceneSignature\(initial\.data\)\)/);
  assert.match(canvas, /const signature = sceneSignature\(initial\.data\)/);
  assert.doesNotMatch(canvas, /UIOptions=\{\{/);
  assert.doesNotMatch(canvas, /renderTopLeftUI/);
});

test("UI contract: note actions stay contextual and system category stays protected", () => {
  const workspace = source(WORKSPACE);
  const sidebar = source(SIDEBAR);
  const activity = source(STUDY_ACTIVITY);
  assert.match(workspace, /Highlight text/);
  assert.match(workspace, /Delete note/);
  assert.match(sidebar, /isSystemCategory = category\.id === "legacy"/);
  assert.match(sidebar, /!isSystemCategory && <ContextMenuItem className="text-danger"/);
  assert.match(workspace, /w-\[min\(235px,calc\(100vw_-_30px\)\)\]/);
  assert.match(activity, /overflow-x-auto overflow-y-hidden/);
  assert.match(activity, /loadError/);
});

test("UI contract: shared primitives use Tailwind, Radix, Motion, and Lucide", () => {
  const button = source(join(UI_COMPONENTS, "button.tsx"));
  const contextMenu = source(join(UI_COMPONENTS, "context-menu.tsx"));
  const dialog = source(join(UI_COMPONENTS, "dialog.tsx"));
  const packageJson = source(WEB_PACKAGE);
  assert.match(source(GLOBALS), /@import\s+["']tailwindcss["']/);
  assert.match(button, /@radix-ui\/react-slot/);
  assert.match(contextMenu, /@radix-ui\/react-context-menu/);
  assert.match(contextMenu, /ContextMenuSubContent/);
  assert.match(dialog, /from ["']motion\/react["']/);
  assert.match(packageJson, /"lucide-react"/);
});

test("architecture contract: transient notifications use the global Tailwind toast layer", () => {
  const toast = source(TOAST_PROVIDER);
  const root = source(ROOT_ROUTE);
  assert.match(toast, /@radix-ui\/react-toast/);
  assert.match(toast, /from "motion\/react"/);
  assert.match(toast, /from "lucide-react"/);
  assert.match(toast, /export function useToast/);
  assert.match(toast, /window\.setTimeout\(\(\) => dismiss\(activeToastId\), duration\)/);
  assert.match(toast, /bottom-\[max\(16px,env\(safe-area-inset-bottom\)\)\]/);
  assert.match(toast, /animate-toast-progress/);
  assert.doesNotMatch(toast, /import\s+["']\.\/?toast\.css["']/);
  assert.doesNotMatch(toast, />Notespace</);
  assert.match(root, /<ToastProvider>/);

  for (const file of [DASHBOARD, CATEGORY_DETAIL, STUDY_ACTIVITY, SIDEBAR, WORKSPACE]) {
    assert.doesNotMatch(source(file), /dashboard-inline-error|sidebar-error|study-inline-error|workspace-feedback|className="save-error"/);
  }
});

test("interaction contract: transient popups close when focus moves to another component", () => {
  const dismissable = source(DISMISSABLE_POPUP);
  const toast = source(TOAST_PROVIDER);
  const confirmDialog = source(CONFIRM_DIALOG);
  const root = source(ROOT_ROUTE);
  const dashboard = source(DASHBOARD);
  const documentEditor = source(DOCUMENT_EDITOR);
  const studyIndicator = source(STUDY_INDICATOR);
  const workspace = source(WORKSPACE);

  assert.match(dismissable, /pointerdown/);
  assert.match(dismissable, /focusin/);
  assert.match(dismissable, /Escape/);
  assert.match(dismissable, /details\[open\]/);
  assert.match(dismissable, /const popupClosers = new Map/);
  assert.match(dismissable, /requestExclusivePopup/);
  assert.match(dismissable, /export function useExclusivePopup/);
  assert.match(toast, /requestExclusivePopup\(\)/);
  assert.match(toast, /setToasts\(\[toast\]\)/);
  assert.match(confirmDialog, /useExclusivePopup\(open/);
  assert.match(root, /<NativePopupManager>/);
  assert.match(dashboard, /useDismissablePopup\(searchRef/);
  assert.match(documentEditor, /useDismissablePopup\(documentRef/);
  assert.match(studyIndicator, /useDismissablePopup\(indicatorRef/);
  assert.match(workspace, /useDismissablePopup\(historyDrawerRef/);
});
