import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const WEB_SRC = join(process.cwd(), "apps", "web", "src");
const STYLES_CSS = join(WEB_SRC, "styles", "globals.css");
const ROUTE_PENDING = join(WEB_SRC, "components", "feedback", "RoutePending.tsx");
const ROUTER = join(WEB_SRC, "router.tsx");
const DASHBOARD = join(WEB_SRC, "features", "dashboard", "Dashboard.tsx");
const SIDEBAR = join(WEB_SRC, "components", "layout", "Sidebar.tsx");
const WORKSPACE = join(WEB_SRC, "features", "workspace", "Workspace.tsx");
const CANVAS = join(WEB_SRC, "integrations", "canvas", "CanvasEditor.tsx");
const ROOT_ROUTE = join(WEB_SRC, "routes", "__root.tsx");
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

test("design contract: approved steel-blue accent and tint tokens from DESIGN.md", () => {
  const css = readFileSync(STYLES_CSS, "utf8");
  assert.match(css, /--accent:\s*#4f7396/i, "light accent must be #4f7396");
  assert.match(css, /--tint:\s*#e8eef6/i, "light active tint must be #e8eef6");
  assert.match(css, /--accent:\s*#7fa6c9/i, "dark accent must be #7fa6c9");
  assert.match(css, /--tint:\s*#1b2636/i, "dark active tint must be #1b2636");
});

test("design contract: entry loading state is informative and motion-safe", () => {
  const pending = readFileSync(ROUTE_PENDING, "utf8");
  const css = readFileSync(STYLES_CSS, "utf8");
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
  const css = readFileSync(STYLES_CSS, "utf8");
  const gradientMatches = css.match(/background(-image)?:\s*[^;]*(linear-gradient|radial-gradient|conic-gradient)[^;]*/gi) ?? [];
  assert.deepEqual(gradientMatches, [], "forbidden gradients detected in styles.css");

  const tsxFiles = collectFiles(WEB_SRC, [".tsx"]);
  for (const file of tsxFiles) {
    const content = readFileSync(file, "utf8");
    assert.doesNotMatch(content, /linear-gradient|radial-gradient/i, `gradient found in ${file}`);
  }
});

test("design contract: no neon glow or excessive blur (>16px)", () => {
  const css = readFileSync(STYLES_CSS, "utf8");
  const blurMatches = css.match(/blur\(\s*(\d+)px\s*\)/g) ?? [];
  for (const match of blurMatches) {
    const px = parseInt(match.replace(/\D/g, ""), 10);
    assert.ok(px <= 16, `excessive blur detected: ${match} > 16px`);
  }
  const neonRegex = /#(00ff00|ff00ff|00ffff|ff0033)/i;
  assert.doesNotMatch(css, neonRegex, "neon color token detected in styles.css");
});

test("design contract: border-radius token does not exceed 24px", () => {
  const css = readFileSync(STYLES_CSS, "utf8");
  const radiusMatches = css.match(/border-radius:\s*(\d+)px/g) ?? [];
  for (const match of radiusMatches) {
    const px = parseInt(match.replace(/\D/g, ""), 10);
    if (px === 9999 || px === 50) continue; // circle/pill
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
  const css = readFileSync(STYLES_CSS, "utf8");
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
  assert.doesNotMatch(sidebar, /type="submit" aria-label={`Create/);
  assert.doesNotMatch(sidebar, /MoreHorizontal|window\.confirm|window\.alert/);
  assert.match(css, /sidebar-inline-create input, \.tree-inline-input[^}]*border: 0/);
  assert.doesNotMatch(css, /input:focus-visible\s*\{[^}]*outline:\s*2px/i);
});

test("architecture contract: legacy app surface and pre-library CSS are removed", () => {
  const css = readFileSync(STYLES_CSS, "utf8");
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
    assert.doesNotMatch(css, selector, `legacy selector ${selector} found in globals.css`);
  }
});

test("design contract: a new workspace opens Note and Canvas with a quiet divider", () => {
  const workspace = readFileSync(WORKSPACE, "utf8");
  const css = readFileSync(STYLES_CSS, "utf8");
  assert.match(workspace, /function defaultLayout[\s\S]*kind: "split"[\s\S]*kind: "canvas"/);
  assert.match(css, /\.pane-resizer::after[\s\S]*background: color-mix/);
  assert.match(css, /\.workspace-main > \.authoring-canvas[\s\S]*flex: 1/);
  assert.match(css, /\.document-editor\s*\{[\s\S]*height:\s*auto[;\s][\s\S]*overflow-y:\s*auto/);
  assert.match(css, /\.document-editor\s*\{[\s\S]*overflow-y:\s*auto[\s\S]*scrollbar-width:\s*none/);
  assert.match(css, /\.document-editor::-webkit-scrollbar\s*\{[\s\S]*display:\s*none/);
  assert.match(css, /\.document-editor > \.tiptap\s*\{[\s\S]*min-height:\s*100%[\s\S]*height:\s*auto/);
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
  assert.doesNotMatch(workspace, /className="context-bar"/);
  assert.match(workspace, /pane\.kind === "note" && <><button onClick=\{\(\) => addCanvasPane/);
  assert.match(workspace, /function findContainingSplit/);
  assert.match(workspace, /maximizedSplitId/);
  assert.match(workspace, /containingSplit && <button onClick=\{\(\) => maximizeSplit\(pane\.id\)\}>Maximize split/);
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
  assert.match(canvas, /loadScene:\s*true/);
  assert.match(canvas, /export:\s*\{\s*saveFileToDisk:\s*true\s*\}/);
  assert.match(canvas, /saveAsImage:\s*true/);
  assert.match(canvas, /tools:\s*\{\s*image:\s*true\s*,?\s*\}/);
  assert.match(canvas, /MainMenu\.DefaultItems\.CommandPalette/);
  assert.match(canvas, /MainMenu\.DefaultItems\.SearchMenu/);
  assert.match(canvas, /MainMenu\.DefaultItems\.Help/);
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
  assert.match(dialog, /from ["']motion\/react["']/);
  assert.match(packageJson, /"lucide-react"/);
});
