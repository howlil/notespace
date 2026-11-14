// Risk/owner policy for the existing browser suite. Full discovery is never narrowed.
// P0: loss/security/recovery; P1: functional workflow; P2: interaction/layout;
// P3: cosmetic-only. Each case inherits its suite's property unless overridden.
const suite = (risk, property, overrides = [], smoke = null) => ({ risk, property, overrides, smoke });
const override = (match, risk, property) => ({ match, risk, property });

export const browserProofPolicy = {
  "canvas/canvas-peer-sync.e2e.mjs": suite("P1", "Same-browser peer delivery and durable scene readback"),
  "canvas/canvas-note.e2e.mjs": suite("P0", "Canvas-native Note creation, focus, persistence and recovery", [
    override(/linked Note instances|embedded Note|advanced rich content/, "P1", "Cross-workspace Note linking, embedding and rich block persistence"),
  ]),
  "canvas/canvas-pinch-zoom.e2e.mjs": suite("P1", "Canvas gesture ownership across native and HTML surfaces"),
  "canvas/canvas-toolbar.e2e.mjs": suite("P1", "Canvas creation, source/output lifecycle, selection and source-only export", [
    override(/CSP blocks/, "P0", "Hostile code cannot fetch or spawn workers; output stays bounded"),
    override(/primary tools|directional spawn|property editing|slash opens/, "P2", "Tool disclosure, directional placement and contextual interaction"),
  ]),
  "canvas/workspace-authoring.e2e.mjs": suite("P2", "Flowchart preview, chaining and placement"),
  "canvas/workspace-border-only.e2e.mjs": suite("P2", "Border-only Canvas control presentation and reachability"),
  "canvas/workspace-html-preview.e2e.mjs": suite("P0", "Hostile HTML stays source-only and survives persistence"),
  "canvas/workspace-persistence.e2e.mjs": suite("P0", "Dirty navigation waits for save; failed save retains source and retry"),
  "canvas/workspace-rail.e2e.mjs": suite("P1", "Explorer collapse preserves Canvas instance, edited source, selection and zoom", [
    override(/narrow Canvas/, "P2", "Narrow Canvas has no horizontal page overflow"),
  ]),
  "canvas/workspace-recovery.e2e.mjs": suite("P0", "Protect unconfirmed local assets and recover version conflicts without losing drafts"),
  "compatibility/activity.e2e.mjs": suite("P1", "Retired Activity UI does not delete historical records"),
  "compatibility/capture.e2e.mjs": suite("P1", "Retired Capture UI does not delete historical records"),
  "compatibility/planning.e2e.mjs": suite("P1", "Historical Milestones/Tasks and legacy updates remain durable"),
  "compatibility/today-projection.e2e.mjs": suite("P1", "Historical carried-forward Tasks remain queryable"),
  "library/critical-journeys.e2e.mjs": suite("P1", "First-run creation, utility access and legacy Workspace links", [], /Welcome creates/),
  "library/design-contract.e2e.mjs": suite("P2", "Library tree, inline editing and focused shell interaction"),
  "library/edge-constraints.e2e.mjs": suite("P1", "Invalid Workspace titles cannot create partial records"),
  "library/library-race.e2e.mjs": suite("P1", "Stale category responses cannot replace the newest selection"),
  "library/library-workflow.e2e.mjs": suite("P1", "Category-targeted create/rename, pending dedupe and recoverable retries"),
  "library/navigation.e2e.mjs": suite("P1", "Category routes and cached sibling navigation survive reload", [], /direct navigation/),
  "library/search.e2e.mjs": suite("P1", "Global search opens the selected Workspace Canvas", [], /global search/),
  "library/unified-shell.e2e.mjs": suite("P1", "Persistent shell, mounted drafts, native fallback and recoverable load failure", [
    override(/compact viewport|category disclosure|Quick Open can open Settings/, "P2", "Drawer/focus/utility interaction and explicit category routing"),
  ]),
  "library/workspace-first-nav.e2e.mjs": suite("P2", "Category disclosure and mobile Explorer reachability", [
    override(/Quick Open does not|Switching categories/, "P1", "Pending/error search and stale category results remain recoverable"),
  ]),
  "library/workspace-pagination.e2e.mjs": suite("P1", "Category traversal keeps its snapshot during a remote rename"),
  "settings/recovery.e2e.mjs": suite("P0", "Trash restore and ZIP backup restore preserve authored Workspaces"),
  "settings/settings.e2e.mjs": suite("P2", "Settings/data/theme have one accessible owner", [
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
  if (/^apps\/web\/src\/features\/workspace-authoring\/canvas\//.test(path)) return suites.filter((file) => file.startsWith("canvas/"));
  if (/^apps\/web\/src\/(features\/library|pages\/home)\//.test(path)) {
    return suites.filter((file) => /^(library\/|settings\/|canvas\/workspace-(persistence|rail|recovery))/.test(file));
  }
  if (/^apps\/web\/src\/features\/search\//.test(path)) return suites.filter((file) => /^(library\/|settings\/settings)/.test(file));
  if (/^apps\/web\/src\/features\/settings\//.test(path)) return suites.filter((file) => /^(settings\/|library\/unified-shell)/.test(file));
  if (/^(docs\/|\.agents\/)|^(README|AGENTS|DESIGN|CHANGELOG)\.md$/.test(path)) return [];
  return null;
}
