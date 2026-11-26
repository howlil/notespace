// Risk/owner policy for the browser E2E suite. Full discovery is never narrowed.
// P0: loss/security/recovery; P1: functional workflow; P2: interaction/layout;
// P3: cosmetic-only. Each case inherits its suite's property unless overridden.
const suite = (risk, property, overrides = [], smoke = null) => ({ risk, property, overrides, smoke });
const override = (match, risk, property) => ({ match, risk, property });

export const browserProofPolicy = {
  "canvas/canvas-note.e2e.mjs": suite("P0", "Canvas-native Note creation, focus, persistence, undo, conflict recovery, and geometry"),
  "canvas/canvas-peer-sync.e2e.mjs": suite("P1", "Same-browser peer delivery and durable scene readback"),
  "canvas/canvas-pinch-zoom.e2e.mjs": suite("P1", "Canvas gesture ownership across native and HTML surfaces"),
  "canvas/canvas-toolbar.e2e.mjs": suite("P1", "Canvas creation, source/output lifecycle, selection and source-only export", [
    override(/CSP blocks/, "P0", "Hostile code cannot fetch or spawn workers; output stays bounded"),
    override(/primary tools|directional spawn|property editing|slash opens/, "P2", "Tool disclosure, directional placement and contextual interaction"),
  ]),
  "canvas/workspace-authoring.e2e.mjs": suite("P2", "Flowchart preview, chaining and placement"),
  "canvas/workspace-html-preview.e2e.mjs": suite("P0", "Hostile HTML stays source-only and survives persistence"),
  "canvas/workspace-persistence.e2e.mjs": suite("P0", "Dirty navigation waits for save; failed save retains source and retry"),
  "canvas/workspace-rail.e2e.mjs": suite("P1", "Explorer collapse preserves Canvas instance, edited source, selection and zoom", [
    override(/narrow Canvas/, "P2", "Narrow Canvas has no horizontal page overflow"),
  ]),
  "canvas/workspace-recovery.e2e.mjs": suite("P0", "Protect unconfirmed local assets and recover version conflicts without losing drafts"),
  "library/cards-right-dock.e2e.mjs": suite("P1", "Global Card Library filtering, Far-Right Icon Rail, and Docked Right Drawer workflows"),
  "library/critical-journeys.e2e.mjs": suite("P1", "First-run creation and legacy Workspace deep-link compatibility", [], /Welcome creates/),
  "library/edge-constraints.e2e.mjs": suite("P1", "Invalid Workspace titles cannot create partial records"),
  "library/library-race.e2e.mjs": suite("P1", "Stale library scope responses cannot replace the newest selection"),
  "library/library-workflow.e2e.mjs": suite("P1", "Root/child create/rename, pending dedupe, parent delete guard, and recoverable retries"),
  "library/navigation.e2e.mjs": suite("P1", "Home roots/all views, hierarchy navigation, Canvas breadcrumb, and reload safety", [], /direct navigation/),
  "library/search.e2e.mjs": suite("P1", "Global search opens the selected Workspace Canvas and handles pending/error retries", [], /global search/),
  "library/unified-shell.e2e.mjs": suite("P1", "Persistent shell, mounted drafts, native fallback and recoverable load failure", [
    override(/compact viewport|contextual Explorer|Quick Open can open Settings|inline workspace rename/, "P2", "Drawer/focus/utility/tree interaction and contextual Explorer routing"),
  ]),
  "library/workspace-pagination.e2e.mjs": suite("P1", "Root workspace traversal keeps its snapshot during a remote rename"),
  "settings/recovery.e2e.mjs": suite("P0", "Trash restore and ZIP backup restore preserve authored Workspaces"),
  "settings/settings.e2e.mjs": suite("P2", "Settings/data/palette have one accessible owner", [
    override(/cannot dismiss while portable restore/, "P0", "An in-flight portable restore cannot be abandoned through dialog dismissal"),
  ]),
};

export function classifyBrowserProof(file, name) {
  const policy = browserProofPolicy[file];
  if (!policy) return { risk: "unknown", property: "Unclassified suite requires full browser proof", smoke: true };
  const selected = policy.overrides.find(({ match }) => match.test(name)) ?? policy;
  return { risk: selected.risk, property: selected.property, smoke: selected.risk === "P0" || Boolean(policy.smoke?.test(name)) };
}

// Unknown/shared paths intentionally return null (full regression), not an empty set.
export function affectedBrowserSuites(path, suites) {
  if (/^tests\/e2e\/.*\.e2e\.mjs$/.test(path)) {
    const matches = suites.filter((file) => `tests/e2e/${file}` === path);
    return matches.length ? matches : null;
  }
  if (/^apps\/web\/src\/modules\/canvas\//.test(path)) return suites.filter((file) => file.startsWith("canvas/"));
  if (/^apps\/web\/src\/modules\/note-editor\//.test(path)) return suites.filter((file) => file.startsWith("canvas/") || file === "library/cards-right-dock.e2e.mjs");
  if (/^apps\/web\/src\/app\/pages\/CardsPage/.test(path)) return suites.filter((file) => file === "library/cards-right-dock.e2e.mjs");
  if (/^apps\/web\/src\/(modules\/library|app\/pages\/HomePage)/.test(path)) {
    return suites.filter((file) => /^(library\/|settings\/|canvas\/workspace-(persistence|rail|recovery))/.test(file));
  }
  if (/^apps\/web\/src\/app\/command-palette\//.test(path)) return suites.filter((file) => /^(library\/|settings\/settings)/.test(file));
  if (/^apps\/web\/src\/app\/settings\//.test(path)) return suites.filter((file) => /^(settings\/|library\/unified-shell)/.test(file));
  if (/^(docs\/|\.agents\/)|^(README|AGENTS|DESIGN|CHANGELOG)\.md$/.test(path)) return [];
  return null;
}
