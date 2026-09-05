import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const WEB_SRC = join(process.cwd(), "apps", "web", "src");
const WEB_PACKAGE = join(process.cwd(), "apps", "web", "package.json");
const VITE_CONFIG = join(process.cwd(), "apps", "web", "vite.config.ts");
const STYLES_CSS = join(WEB_SRC, "styles", "globals.css");
const SIDEBAR_CSS = join(WEB_SRC, "components", "layout", "sidebar.css");
const CATEGORY_CSS = join(WEB_SRC, "features", "category", "category-detail.css");
const WORKSPACE_CSS = join(WEB_SRC, "features", "workspace", "workspace.css");
const ROUTE_PENDING = join(WEB_SRC, "components", "feedback", "RoutePending.tsx");
const ROUTER = join(WEB_SRC, "router.tsx");
const DASHBOARD = join(WEB_SRC, "features", "dashboard", "Dashboard.tsx");
const CATEGORY_DETAIL = join(WEB_SRC, "features", "category", "CategoryDetail.tsx");
const STUDY_ACTIVITY = join(WEB_SRC, "features", "study", "StudyActivityDashboard.tsx");
const SIDEBAR = join(WEB_SRC, "components", "layout", "Sidebar.tsx");
const WORKSPACE = join(WEB_SRC, "features", "workspace", "Workspace.tsx");
const DOCUMENT_EDITOR = join(WEB_SRC, "integrations", "document", "DocumentEditor.tsx");
const CANVAS = join(WEB_SRC, "integrations", "canvas", "CanvasEditor.tsx");
const LOCAL_IMAGE_ASSETS = join(WEB_SRC, "domain", "assets", "local-image-assets.ts");
const ROOT_ROUTE = join(WEB_SRC, "routes", "__root.tsx");
const TOAST_PROVIDER = join(WEB_SRC, "providers", "toast-provider.tsx");
const DISMISSABLE_POPUP = join(WEB_SRC, "components", "ui", "dismissable.tsx");
const CONFIRM_DIALOG = join(WEB_SRC, "components", "ui", "confirm-dialog.tsx");
const STUDY_INDICATOR = join(WEB_SRC, "features", "study", "StudyIndicator.tsx");
const FAVICON = join(process.cwd(), "apps", "web", "public", "favicon.svg");
const UI_COMPONENTS = join(WEB_SRC, "components", "ui");
const LEGACY_APP = join(WEB_SRC, "app");

function collectFiles(dir: string, ext: string[]): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...collectFiles(full, ext));
    } else if (ext.some((e) => entry.endsWith(e))) {
      results.push(full);
    }
  }
  return results;
}

function readAllStyles(): string {
  return collectFiles(WEB_SRC, [".css"])
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
}

test("design contract: approved steel-blue accent and tint tokens from DESIGN.md", () => {
  const css = readFileSync(STYLES_CSS, "utf8");
  assert.match(css, /--accent:\s*#4f7396/i, "light accent must be #4f7396");
  assert.match(css, /--tint:\s*#e8eef6/i, "light active tint must be #e8eef6");
  assert.match(css, /--accent:\s*#7fa6c9/i, "dark accent must be #7fa6c9");
  assert.match(css, /--tint:\s*#1b2636/i, "dark active tint must be #1b2636");
});

test("architecture contract: Tailwind v4 uses the official Vite and CSS-first setup", () => {
  const packageJson = readFileSync(WEB_PACKAGE, "utf8");
  const vite = readFileSync(VITE_CONFIG, "utf8");
  const css = readFileSync(STYLES_CSS, "utf8");
  assert.match(packageJson, /"tailwindcss":\s*"\^4\./);
  assert.match(packageJson, /"@tailwindcss\/vite":\s*"\^4\./);
  assert.match(vite, /import tailwindcss from "@tailwindcss\/vite"/);
  assert.match(vite, /tailwindcss\(\)/);
  assert.match(css, /@import "tailwindcss";/);
  assert.match(css, /@theme/);
  assert.doesNotMatch(css, /@tailwind\s+(base|components|utilities)/);
  assert.doesNotMatch(css, /@config\s+/);
});

test("architecture contract: global CSS owns tokens and defaults, not feature styling", () => {
  const css = readFileSync(STYLES_CSS, "utf8");
  assert.match(css, /@theme/);
  assert.match(css, /@layer base/);
  for (const selector of [/\.sidebar\b/, /\.dashboard\b/, /\.tiptap\b/, /\.pane-resizer\b/, /\.toast-viewport\b/]) {
    assert.doesNotMatch(css, selector, `feature selector ${selector} leaked into globals.css`);
  }
});

test("design contract: entry loading state is informative and motion-safe", () => {
  const pending = readFileSync(ROUTE_PENDING, "utf8");
  const css = readAllStyles();
  assert.match(pending, /role="status"/);
  assert.match(pending, /Preparing your workspace/);
  assert.match(pending, /loading-preview/);
  assert.match(css, /\.loading-progress/);
  assert.match(css, /prefers-reduced-motion/);
});

test("runtime contract: dev router does not start abort-prone intent preloads", () => {
  const router = readFileSync(ROUTER, "utf8");
  assert.match(router, /defaultPreload:\s*import\.meta\.env\.DEV\s*\?\s*false\s*:\s*"intent"/);
});

test("design contract: no gradient hero areas or decorative gradient backgrounds", () => {
  const css = readAllStyles();
  const gradientMatches = css.match(/background(-image)?:\s*[^;]*(linear-gradient|radial-gradient|conic-gradient)[^;]*/gi) ?? [];
  assert.deepEqual(gradientMatches, [], "forbidden gradients detected in component styles");

  const tsxFiles = collectFiles(WEB_SRC, [".tsx"]);
  for (const file of tsxFiles) {
    const content = readFileSync(file, "utf8");
    assert.doesNotMatch(content, /linear-gradient|radial-gradient/i, `gradient found in ${file}`);
  }
});

test("design contract: no neon glow or excessive blur (>16px)", () => {
  const css = readAllStyles();
  const blurMatches = css.match(/blur\(\s*(\d+)px\s*\)/g) ?? [];
  for (const match of blurMatches) {
    const px = parseInt(match.replace(/\D/g, ""), 10);
    assert.ok(px <= 16, `excessive blur detected: ${match} > 16px`);
  }
  const neonRegex = /#(00ff00|ff00ff|00ffff|ff0033)/i;
  assert.doesNotMatch(css, neonRegex, "neon color token detected in component styles");
});

test("design contract: border-radius token does not exceed 24px", () => {
  const css = readAllStyles();
  const radiusMatches = css.match(/border-radius:\s*(\d+)px/g) ?? [];
  for (const match of radiusMatches) {
    const px = parseInt(match.replace(/\D/g, ""), 10);
    if (px === 9999 || px === 999 || px === 50) continue; // circle/pill
    assert.ok(px <= 24, `border radius exceeds 24px: ${match}`);
  }
});

test("design contract: no AI slop motifs (sparkles, wand) or AI marketing copy in UI source", () => {
  const tsxFiles = collectFiles(WEB_SRC, [".tsx"]);
  for (const file of tsxFiles) {
    const content = readFileSync(file, "utf8");
    assert.doesNotMatch(content, /[\u2728\u{1FA84}]/u, `AI sparkle/wand emoji found in ${file}`);
    assert.doesNotMatch(content, /ai-powered|magic wand|smart assistant/i, `AI marketing copy found in ${file}`);
  }
});

test("design contract: no user-facing legacy 'Project' copy in Category -> Workspace flow", () => {
  const tsxFiles = collectFiles(WEB_SRC, [".tsx"]);
  const forbiddenPatterns = [
    /Project not found/i,
    /Back to projects/i,
    /No projects yet/i,
    /New project/i,
    /Delete project/i,
    /Rename project/i,
  ];
  for (const file of tsxFiles) {
    const content = readFileSync(file, "utf8");
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(content, pattern, `legacy project copy '${pattern}' found in ${file}`);
    }
  }
});

test("design contract: library creation stays in the sidebar and actions stay contextual", () => {
  const dashboard = readFileSync(DASHBOARD, "utf8");
  const sidebar = readFileSync(SIDEBAR, "utf8");
  const css = readAllStyles();
  const sidebarCss = readFileSync(SIDEBAR_CSS, "utf8");
  const categoryCss = readFileSync(CATEGORY_CSS, "utf8");
  const workspaceCss = readFileSync(WORKSPACE_CSS, "utf8");
  assert.doesNotMatch(dashboard, /Knowledge, organized\.|Manage category|\+ New workspace/);
  assert.doesNotMatch(dashboard, /dashboard-brand|<Brand/);
  assert.doesNotMatch(dashboard, /dashboard-context|library-count|SELECTED CATEGORY|WORKSPACE LIBRARY/);
  assert.match(dashboard, /dashboard-topbar-actions/);
  assert.match(dashboard, /<ThemeToggle \/>/);
  assert.match(sidebar, /sidebar-create-tools/);
  assert.doesNotMatch(sidebar, /<ThemeToggle \/>/);
  assert.match(sidebar, /onContextMenu/);
  assert.match(sidebar, /onDoubleClick/);
  assert.match(sidebar, /requestSubmit/);
  assert.match(sidebar, /await deleteProject\(target\.item\.id\);[\s\S]*setChildren\(\(current\) => Object\.fromEntries[\s\S]*workspace\.id !== target\.item\.id/);
  assert.doesNotMatch(sidebar, /type="submit" aria-label={`Create/);
  assert.doesNotMatch(sidebar, /MoreHorizontal|window\.confirm|window\.alert/);
  assert.match(sidebarCss, /\.sidebar-inline-create input,\s*\.tree-inline-input[\s\S]*border:\s*0/);
  assert.match(categoryCss, /\.quick-create input\s*\{[\s\S]*border:\s*0/);
  assert.match(categoryCss, /\.inline-dashboard-input\s*\{[\s\S]*border-bottom:\s*0/);
  assert.match(workspaceCss, /\.pane-title-input\s*\{[\s\S]*border-bottom:\s*0/);
  assert.doesNotMatch(css, /input:focus-visible\s*\{[^}]*outline:\s*2px/i);
});

test("architecture contract: legacy app surface and pre-library CSS are removed", () => {
  const css = readAllStyles();
  assert.equal(existsSync(LEGACY_APP), false, "legacy apps/web/src/app directory must not return");
  for (const selector of [
    /\.workspace-split\b/,
    /\.document-pane\b/,
    /\.canvas-pane\b/,
    /\.splitter\b/,
    /\.format-toolbar\b/,
    /\.project-grid\b/,
    /\.project-card\b/,
    /\.project-table\b/,
    /\.view-switcher\b/,
    /\.view-mode\b/,
    /\.note-strip\b/,
    /\.focus-mode-toggle\b/,
  ]) {
    assert.doesNotMatch(css, selector, `legacy selector ${selector} found in component styles`);
  }
});

test("design contract: a new workspace opens Note and Canvas with a quiet divider", () => {
  const workspace = readFileSync(WORKSPACE, "utf8");
  const documentEditor = readFileSync(DOCUMENT_EDITOR, "utf8");
  const css = readAllStyles();
  assert.match(workspace, /function defaultLayout[\s\S]*kind: "split"[\s\S]*kind: "canvas"/);
  assert.match(css, /\.pane-resizer::after[\s\S]*background: color-mix/);
  assert.match(css, /\.authoring-canvas\s*\{[\s\S]*flex:\s*1/);
  assert.match(documentEditor, /EditorContent editor=\{editor\} className="document-editor-content"/);
  assert.match(css, /\.document-editor\s*\{[\s\S]*height:\s*auto[;\s][\s\S]*overflow:\s*hidden/);
  assert.match(css, /\.document-editor-content\s*\{[\s\S]*height:\s*100%[\s\S]*overflow:\s*hidden/);
  assert.match(css, /\.document-editor-content > \.tiptap\s*\{[\s\S]*height:\s*100%[\s\S]*overflow-y:\s*auto[\s\S]*scrollbar-width:\s*none/);
  assert.match(css, /\.document-editor-content > \.tiptap::-webkit-scrollbar\s*\{[\s\S]*display:\s*none/);
  assert.match(css, /\.tiptap blockquote\s*\{[\s\S]*border:\s*0[;\s][\s\S]*padding-left:\s*0/);
  assert.match(css, /\.pane-content-context\s*\{[\s\S]*display:\s*flex[\s\S]*flex-direction:\s*column[\s\S]*min-height:\s*0/);
  assert.match(css, /\.pane-content-context > \.document-editor,[\s\S]*\.pane-content-context > \.canvas-editor\s*\{[\s\S]*min-height:\s*0[\s\S]*height:\s*auto/);
  assert.match(css, /\.authoring-canvas\.is-maximized \.pane-actions > \.pane-menu\s*\{[\s\S]*position:\s*fixed[\s\S]*right:\s*12px[\s\S]*max-width:\s*calc\(100vw - 24px\)[\s\S]*overflow-y:\s*auto/);
  assert.match(workspace, /is-focus-mode/);
  assert.match(workspace, /focus-mode-timer/);
  assert.match(css, /\.workspace-main\.is-focus-mode \.workspace-header\s*\{[\s\S]*display:\s*none/);
  assert.match(css, /\.focus-mode-timer\s*\{[\s\S]*position:\s*fixed[\s\S]*z-index:\s*55/);
  assert.match(
    css,
    /\.workspace-main \.inline-title-input,[\s\S]*\.workspace-main \.pane-title-input\s*\{[\s\S]*border-bottom:\s*0[;\s]/,
  );
  assert.match(workspace, /pane-add-note/);
  assert.match(workspace, /onDoubleClick/);
  assert.match(workspace, /ContextMenuItem onSelect=\{\(\) => switchPaneNote/);
  assert.match(workspace, /function selectionContext/);
  assert.match(workspace, /Send to Canvas/);
  assert.match(workspace, /Send to Note/);
  assert.match(workspace, /Link selected object to note/);
  assert.match(workspace, /Link selected block to Canvas/);
  assert.match(workspace, /Select a Canvas object first/);
  assert.match(workspace, /function normalizeDocument/);
  assert.match(workspace, /attrs: \{ blockId \}/);
  assert.doesNotMatch(workspace, /className="context-bar"/);
  assert.match(workspace, /pane\.kind === "note" && <><button onClick=\{\(\) => addCanvasPane/);
  assert.match(workspace, /function findContainingSplit/);
  assert.match(workspace, /maximizedSplitId/);
  assert.match(workspace, /containingSplit && <button onClick=\{\(\) => maximizeSplit\(pane\.id\)\}>Maximize split/);
  assert.match(workspace, /pane\.kind === "canvas" && <button onClick=\{\(\) => openNotePane\(pane\.id\)\}>Open note/);
  assert.match(workspace, /function documentBlocks/);
  assert.match(workspace, /function linkCanvasToBlock/);
  assert.match(workspace, /ContextMenuSubTrigger>.*Link selected object to note/);
  assert.match(workspace, /Link selected block to Canvas/);
});

test("UI contract: maximizing a split keeps the split layout available", () => {
  const workspace = readFileSync(WORKSPACE, "utf8");
  assert.match(workspace, /function findSplit/);
  assert.match(workspace, /function maximizeSplit/);
  assert.match(workspace, /maximizedSplit \? renderNode\(maximizedSplit\)/);
  assert.match(workspace, /focusMode = Boolean\(maximizedPaneId \|\| maximizedSplitId\)/);
});

test("UI contract: the root document registers the Notespace favicon", () => {
  const root = readFileSync(ROOT_ROUTE, "utf8");
  const favicon = readFileSync(FAVICON, "utf8");
  assert.match(root, /rel: "icon"/);
  assert.match(root, /href: "\/favicon\.svg"/);
  assert.match(favicon, /viewBox="0 0 64 64"/);
  assert.match(favicon, /#4f7396/);
});

test("UI contract: Canvas keeps the full Excalidraw tool and utility menu", () => {
  const canvas = readFileSync(CANVAS, "utf8");
  const documentEditor = readFileSync(DOCUMENT_EDITOR, "utf8");
  const localAssets = readFileSync(LOCAL_IMAGE_ASSETS, "utf8");
  const packageJson = readFileSync(join(process.cwd(), "apps", "web", "package.json"), "utf8");
  assert.match(canvas, /loadScene:\s*true/);
  assert.match(canvas, /export:\s*\{\s*saveFileToDisk:\s*true\s*\}/);
  assert.match(canvas, /saveAsImage:\s*true/);
  assert.match(canvas, /tools:\s*\{\s*image:\s*true\s*,?\s*\}/);
  assert.match(canvas, /native bucket-fill tool/);
  assert.match(canvas, /onInitialize=\{onInitialize\}/);
  assert.match(canvas, /setViewport\(\{[\s\S]*target: element[\s\S]*fit: "scale-down"/);
  assert.match(packageJson, /"@excalidraw\/excalidraw":\s*"npm:@dwelle\/excalidraw@0\.5\.0-b276327"/);
  assert.match(packageJson, /@excalidraw\/excalidraw/);
  assert.match(canvas, /MainMenu\.DefaultItems\.CommandPalette/);
  assert.match(canvas, /MainMenu\.DefaultItems\.SearchMenu/);
  assert.match(canvas, /MainMenu\.DefaultItems\.Help/);
  assert.match(canvas, /restoreLocalFiles/);
  assert.match(canvas, /persistCanvasFiles/);
  assert.match(canvas, /persistedFileIds/);
  assert.match(canvas, /files:\s*\{\}/);
  assert.match(canvas, /storeImageAsset\(workspaceId, fileId/);
  assert.match(documentEditor, /handlePaste:/);
  assert.match(documentEditor, /Highlight/);
  assert.match(documentEditor, /commands\.selectAll\(\)/);
  assert.match(documentEditor, /commands\.deleteSelection\(\)/);
  assert.match(documentEditor, /toggleHighlight\(\)/);
  assert.match(documentEditor, /item\.type\.startsWith\("image\/"\)/);
  assert.match(documentEditor, /storeImageAsset\(workspaceId, assetId/);
  assert.match(documentEditor, /notespace-asset:\/\//);
  assert.match(localAssets, /indexedDB\.open\(DATABASE_NAME/);
  assert.match(localAssets, /MAX_ASSET_BYTES = 8 \* 1024 \* 1024/);
  assert.match(localAssets, /normalizeImageBlob/);
});

test("stability contract: Excalidraw keeps one instance while Workspace state changes", () => {
  const canvas = readFileSync(CANVAS, "utf8");
  assert.match(canvas, /const canvasUIOptions = \{/);
  assert.match(canvas, /const changed = useCallback\(/);
  assert.match(canvas, /const onInitialize = useCallback\(/);
  assert.match(canvas, /const lastExternalScene = useRef\(sceneSignature\(initial\.data\)\)/);
  assert.match(canvas, /const signature = sceneSignature\(initial\.data\)/);
  assert.doesNotMatch(canvas, /UIOptions=\{\{/);
  assert.doesNotMatch(canvas, /renderTopLeftUI/);
});

test("UI contract: note actions stay contextual and the system category is protected", () => {
  const workspace = readFileSync(WORKSPACE, "utf8");
  const sidebar = readFileSync(SIDEBAR, "utf8");
  const css = readAllStyles();
  const activity = readFileSync(STUDY_ACTIVITY, "utf8");
  assert.match(workspace, /Highlight text/);
  assert.match(workspace, /Delete note/);
  assert.match(sidebar, /isSystemCategory = category\.id === "legacy"/);
  assert.match(sidebar, /!isSystemCategory && <ContextMenuItem className="text-\[var\(--danger\)\]"/);
  assert.match(css, /\.pane-header > \.pane-title \+ \.pane-actions > \.pane-menu\s*\{[^}]*left: 0/);
  assert.match(css, /\.workspace-menu-popover\s*\{[\s\S]*width: max-content/);
  assert.match(css, /\.menu-item\s*\{[\s\S]*justify-content: flex-start/);
  assert.match(css, /\.history-drawer\s*\{[\s\S]*width: min\(235px/);
  assert.match(css, /\.study-activity-compact \.heatmap-scroll\s*\{[^}]*max-height: none[^}]*overflow-x: auto/);
  assert.match(activity, /loadError/);
});

test("UI contract: shared primitives use Tailwind, Radix, Motion, and Lucide", () => {
  const button = readFileSync(join(UI_COMPONENTS, "button.tsx"), "utf8");
  const contextMenu = readFileSync(join(UI_COMPONENTS, "context-menu.tsx"), "utf8");
  const dialog = readFileSync(join(UI_COMPONENTS, "dialog.tsx"), "utf8");
  const css = readFileSync(STYLES_CSS, "utf8");
  const packageJson = readFileSync(join(process.cwd(), "apps", "web", "package.json"), "utf8");
  assert.match(css, /@import\s+["']tailwindcss["']/);
  assert.match(button, /@radix-ui\/react-slot/);
  assert.match(contextMenu, /@radix-ui\/react-context-menu/);
  assert.match(contextMenu, /ContextMenuSubContent/);
  assert.match(dialog, /from ["']motion\/react["']/);
  assert.match(packageJson, /"lucide-react"/);
});

test("architecture contract: transient notifications use the global toast layer", () => {
  const toast = readFileSync(TOAST_PROVIDER, "utf8");
  const root = readFileSync(ROOT_ROUTE, "utf8");
  const css = readAllStyles();
  const notificationSources = [DASHBOARD, CATEGORY_DETAIL, STUDY_ACTIVITY, SIDEBAR, WORKSPACE];

  assert.match(toast, /@radix-ui\/react-toast/);
  assert.match(toast, /from "motion\/react"/);
  assert.match(toast, /from "lucide-react"/);
  assert.match(toast, /export function useToast/);
  assert.match(toast, /window\.setTimeout\(\(\) => dismiss\(activeToastId\), duration\)/);
  assert.match(toast, /ToastPrimitive\.Description className="toast-message">\{toast\.message\}/);
  assert.doesNotMatch(toast, />Notespace</);
  assert.match(css, /\.toast-viewport\s*\{[\s\S]*bottom:\s*max\(/);
  assert.match(css, /\.toast-progress\s*\{[\s\S]*animation:\s*toast-progress/);
  assert.match(root, /<ToastProvider>/);

  for (const file of notificationSources) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /dashboard-inline-error|sidebar-error|study-inline-error|workspace-feedback|className="save-error"/, `inline notification remains in ${file}`);
  }
});

test("interaction contract: transient popups close when focus moves to another component", () => {
  const dismissable = readFileSync(DISMISSABLE_POPUP, "utf8");
  const toast = readFileSync(TOAST_PROVIDER, "utf8");
  const confirmDialog = readFileSync(CONFIRM_DIALOG, "utf8");
  const root = readFileSync(ROOT_ROUTE, "utf8");
  const dashboard = readFileSync(DASHBOARD, "utf8");
  const documentEditor = readFileSync(DOCUMENT_EDITOR, "utf8");
  const studyIndicator = readFileSync(STUDY_INDICATOR, "utf8");
  const workspace = readFileSync(WORKSPACE, "utf8");

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
