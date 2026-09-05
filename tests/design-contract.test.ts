import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const WEB = join(ROOT, "apps", "web");
const WEB_SRC = join(WEB, "src");
const GLOBALS = join(WEB_SRC, "styles", "globals.css");
const ROOT_ROUTE = join(WEB_SRC, "routes", "__root.tsx");
const ROUTE_PENDING = join(WEB_SRC, "components", "feedback", "RoutePending.tsx");
const DASHBOARD = join(WEB_SRC, "features", "dashboard", "Dashboard.tsx");
const CATEGORY_DETAIL = join(WEB_SRC, "features", "category", "CategoryDetail.tsx");
const SIDEBAR = join(WEB_SRC, "components", "layout", "Sidebar.tsx");
const WORKSPACE = join(WEB_SRC, "features", "workspace", "Workspace.tsx");
const DOCUMENT_EDITOR = join(WEB_SRC, "integrations", "document", "DocumentEditor.tsx");
const CANVAS = join(WEB_SRC, "integrations", "canvas", "CanvasEditor.tsx");
const TOAST_PROVIDER = join(WEB_SRC, "providers", "toast-provider.tsx");
const STUDY_ACTIVITY = join(WEB_SRC, "features", "study", "StudyActivityDashboard.tsx");
const STUDY_INDICATOR = join(WEB_SRC, "features", "study", "StudyIndicator.tsx");
const DISMISSABLE_POPUP = join(WEB_SRC, "components", "ui", "dismissable.tsx");
const CONFIRM_DIALOG = join(WEB_SRC, "components", "ui", "confirm-dialog.tsx");
const LOCAL_IMAGE_ASSETS = join(WEB_SRC, "domain", "assets", "local-image-assets.ts");
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

function source(path: string) {
  return readFileSync(path, "utf8");
}

test("frontend styling contract: Tailwind v4 uses the official Vite and CSS-first setup", () => {
  const packageJson = source(WEB_PACKAGE);
  const vite = source(VITE_CONFIG);
  const globals = source(GLOBALS);

  assert.match(packageJson, /"tailwindcss":\s*"\^4\.3\.3"/);
  assert.match(packageJson, /"@tailwindcss\/vite":\s*"\^4\.3\.3"/);
  assert.match(vite, /import tailwindcss from "@tailwindcss\/vite"/);
  assert.match(vite, /tailwindcss\(\)/);
  assert.match(globals, /@import "tailwindcss";/);
  assert.match(globals, /@theme/);
  assert.doesNotMatch(globals, /@tailwind\s+(base|components|utilities)/);
  assert.doesNotMatch(globals, /@config\s+/);
  assert.equal(existsSync(join(WEB, "tailwind.config.ts")), false);
});

test("frontend styling contract: globals.css is the only app-authored stylesheet", () => {
  assert.deepEqual(collectFiles(WEB_SRC, [".css"]), [GLOBALS]);
  assert.match(source(ROOT_ROUTE), /import "\.\.\/styles\/globals\.css";/);

  for (const file of collectFiles(WEB_SRC, [".ts", ".tsx"])) {
    if (file === ROOT_ROUTE) continue;
    assert.doesNotMatch(source(file), /import\s+["']\.\.?\/[^"']+\.css["']/, `feature stylesheet import remains in ${file}`);
  }

  assert.match(source(CANVAS), /import "@excalidraw\/excalidraw\/index\.css";/);
});

test("frontend styling contract: globals owns tokens and document defaults, not feature selectors", () => {
  const globals = source(GLOBALS);
  assert.match(globals, /--accent:\s*#4f7396/i);
  assert.match(globals, /--tint:\s*#e8eef6/i);
  assert.match(globals, /--accent:\s*#7fa6c9/i);
  assert.match(globals, /--tint:\s*#1b2636/i);
  assert.match(globals, /@layer base/);
  assert.match(globals, /prefers-reduced-motion/);

  for (const selector of [/\.sidebar\b/, /\.dashboard\b/, /\.tiptap\b/, /\.pane-resizer\b/, /\.toast-viewport\b/, /\.workspace-main\b/]) {
    assert.doesNotMatch(globals, selector, `feature selector ${selector} leaked into globals.css`);
  }
});

test("frontend styling contract: application surfaces are utility-first", () => {
  for (const file of [ROUTE_PENDING, DASHBOARD, CATEGORY_DETAIL, SIDEBAR, WORKSPACE, DOCUMENT_EDITOR, CANVAS, TOAST_PROVIDER, STUDY_ACTIVITY, STUDY_INDICATOR]) {
    const content = source(file);
    assert.match(content, /className=/, `Tailwind classes missing from ${file}`);
    assert.doesNotMatch(content, /import\s+["']\.\.?\/[^"']+\.css["']/, `feature CSS import remains in ${file}`);
  }

  assert.match(source(WORKSPACE), /after:bg-\[color-mix\(/);
  assert.match(source(DOCUMENT_EDITOR), /\[&_blockquote\]:border-0/);
  assert.match(source(CANVAS), /\[&_\.App-toolbar\]/);
  assert.match(source(TOAST_PROVIDER), /animate-toast-progress/);
});

test("frontend styling contract: removed feature stylesheets do not return", () => {
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
  ]) {
    assert.equal(existsSync(path), false, `${path} must stay removed`);
  }
});

test("design contract: loading, toast, and editor motion remain accessible", () => {
  const pending = source(ROUTE_PENDING);
  const toast = source(TOAST_PROVIDER);
  const globals = source(GLOBALS);

  assert.match(pending, /role="status"/);
  assert.match(pending, /Preparing your workspace/);
  assert.match(pending, /animate-loading-progress/);
  assert.match(toast, /animate-toast-progress/);
  assert.match(globals, /--animate-loading-progress/);
  assert.match(globals, /--animate-toast-progress/);
  assert.match(globals, /prefers-reduced-motion/);
});

test("design contract: no decorative gradients, neon motifs, or legacy Project copy", () => {
  const content = collectFiles(WEB_SRC, [".tsx"]).map(source).join("\n");
  assert.doesNotMatch(`${source(GLOBALS)}\n${content}`, /linear-gradient|radial-gradient|conic-gradient/i);
  assert.doesNotMatch(content, /#(00ff00|ff00ff|00ffff|ff0033)/i);
  assert.doesNotMatch(content, /[\u2728\u{1FA84}]/u);
  assert.doesNotMatch(content, /ai-powered|magic wand|smart assistant/i);
  for (const pattern of [/Project not found/i, /Back to projects/i, /No projects yet/i, /New project/i, /Delete project/i, /Rename project/i]) {
    assert.doesNotMatch(content, pattern);
  }
});

test("workspace contract: Note + Canvas split behavior survives the styling migration", () => {
  const workspace = source(WORKSPACE);
  const editor = source(DOCUMENT_EDITOR);

  assert.match(workspace, /function defaultLayout[\s\S]*kind: "split"[\s\S]*kind: "canvas"/);
  assert.match(workspace, /function splitPane/);
  assert.match(workspace, /function maximizeSplit/);
  assert.match(workspace, /maximizedSplit \? renderNode\(maximizedSplit\)/);
  assert.match(workspace, /function selectionContext/);
  assert.match(workspace, /Send to Canvas/);
  assert.match(workspace, /Send to Note/);
  assert.match(workspace, /Link selected object to note/);
  assert.match(workspace, /Link selected block to Canvas/);
  assert.match(workspace, /after:bg-\[color-mix\(in_srgb,var\(--line\)_72%,transparent\)\]/);
  assert.match(editor, /class: editorClassName/);
  assert.match(editor, /\[scrollbar-width:none\]/);
  assert.match(editor, /\[&::-webkit-scrollbar\]:hidden/);
});

test("Canvas contract: native Excalidraw capabilities and local image persistence remain intact", () => {
  const canvas = source(CANVAS);
  const editor = source(DOCUMENT_EDITOR);
  const assets = source(LOCAL_IMAGE_ASSETS);
  const packageJson = source(WEB_PACKAGE);

  assert.match(packageJson, /"@excalidraw\/excalidraw":\s*"npm:@dwelle\/excalidraw@0\.5\.0-b276327"/);
  assert.match(canvas, /MainMenu\.DefaultItems\.CommandPalette/);
  assert.match(canvas, /MainMenu\.DefaultItems\.SearchMenu/);
  assert.match(canvas, /MainMenu\.DefaultItems\.Help/);
  assert.match(canvas, /restoreLocalFiles/);
  assert.match(canvas, /persistCanvasFiles/);
  assert.match(canvas, /files:\s*\{\}/);
  assert.match(editor, /handlePaste:/);
  assert.match(editor, /storeImageAsset\(workspaceId, assetId/);
  assert.match(assets, /indexedDB\.open\(DATABASE_NAME/);
});

test("interaction contract: contextual popups still share one dismissal model", () => {
  const dismissable = source(DISMISSABLE_POPUP);
  assert.match(dismissable, /pointerdown/);
  assert.match(dismissable, /focusin/);
  assert.match(dismissable, /Escape/);
  assert.match(dismissable, /details\[open\]/);
  assert.match(dismissable, /requestExclusivePopup/);
  assert.match(source(TOAST_PROVIDER), /requestExclusivePopup\(\)/);
  assert.match(source(CONFIRM_DIALOG), /useExclusivePopup\(open/);
  assert.match(source(DASHBOARD), /useDismissablePopup\(searchRef/);
  assert.match(source(DOCUMENT_EDITOR), /useDismissablePopup\(documentRef/);
  assert.match(source(STUDY_INDICATOR), /useDismissablePopup\(indicatorRef/);
  assert.match(source(WORKSPACE), /useDismissablePopup\(historyDrawerRef/);
});

test("runtime and identity contracts remain intact", () => {
  assert.match(source(ROUTER), /defaultPreload:\s*import\.meta\.env\.DEV\s*\?\s*false\s*:\s*"intent"/);
  assert.match(source(ROOT_ROUTE), /href: "\/favicon\.svg"/);
  assert.match(source(FAVICON), /#4f7396/);
});
