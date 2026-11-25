// Lean CI lane plan and gate.
// Pull requests select lanes per changed owner with conservative fail-closed fallback.
// Master pushes skip heavy app/desktop lanes only for pure docs-only or landing-only
// diffs (verified release targets enforce required lane proofs before publication).
// Scheduled and manual runs always select every lane.
import { appendFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";

export const LANES = ["web", "server", "browser", "landing", "desktop", "release-policy", "compose"];
export const CANDIDATE_TARGET_LANES = {
  desktop: ["web", "server", "browser", "desktop", "release-policy"],
  image: ["web", "server", "browser", "compose"],
};

const DOCS = /^(docs\/|\.agents\/|(README|AGENTS|DESIGN|CHANGELOG|CONTRIBUTING|CODE_OF_CONDUCT|SECURITY|SUPPORT)\.md$|\.github\/PULL_REQUEST_TEMPLATE\.md$|\.github\/ISSUE_TEMPLATE\/(bug_report|feature_request|config)\.yml$)/;
// Landing tests assert published self-host commands against the root README.
const README_CONTRACT = /^README\.md$/;
const LANDING = /^(landing\/|wrangler\.jsonc$)/;
const RELEASE_POLICY = /^(scripts\/|\.github\/workflows\/|Taskfile\.yml$|package\.json$)/;
const DESKTOP_BETA_NOTE = /^docs\/DESKTOP_BETA_RELEASE_/;
const WEB_UNIT_ONLY = /^(apps\/web\/.*\.test\.tsx?|eslint\.config\.mjs|tsconfig\.base\.json)$/;
const WEB_E2E = /^tests\/e2e\//;
const WEB_SETTINGS = /^apps\/web\/src\/app\/settings\//;
const WEB_APP = /^apps\/web\//;
const SERVER_TEST_ONLY = /^apps\/server\/.*_test\.go$/;
const SERVER_APP = /^apps\/server\//;
const DESKTOP_APP = /^apps\/desktop\//;
const COMPOSE = /^(Dockerfile|\.dockerignore|compose(\.[a-z0-9_-]+)?\.ya?ml|scripts\/verify\/smoke-persistence\.py)$/;
const NATIVE_SCRIPTS = /^(scripts\/(release|dev|assets)\/|scripts\/verify\/(desktop|native|smoke-desktop|assert-windows|check-desktop|test-desktop|prepare-native))/;
const RELEASE_POLICY_ONLY = /^(scripts\/release\/(resolve-desktop-release-version|assert-desktop-release-ci|release-request)\.mjs|scripts\/(release|verify|assets)\/.*\.test\.mjs)$/;
const WEB_SCRIPTS = /^scripts\/verify\/(browser-|run-node-tests)/;
const SERVER_SCRIPTS = /^scripts\/verify\/(check-gofmt|server-process-integration)/;
const CI_PLAN_SCRIPTS = /^scripts\/verify\/ci-plan(\.test)?\.mjs$/;
const WORKFLOW_DESKTOP_OR_RELEASE = /^\.github\/workflows\/(verify-desktop|release|release-desktop|publish-desktop)\.yml$/;

// Paths that can change the native Windows WebView2/sidecar/release proof.
// Test-only Go/web files and pure SemVer/admission scripts do not alter the native binary.
const NATIVE_MATCH = new RegExp([
  "^docs/DESKTOP_BETA_RELEASE_",
  "^apps/desktop/",
  "^scripts/(release|dev|assets)/",
  "^scripts/verify/(desktop|native|smoke-desktop|assert-windows|check-desktop|test-desktop|prepare-native)",
  "^apps/server/(cmd|internal/app|internal/domain|internal/infra)/",
  "^apps/web/src/(platform/desktop|platform/runtime|routes/__root|app/AppRoot)",
  "^apps/web/src/modules/canvas/objects/code-block/(CodeBlockContextMenu\\.tsx|preview/)",
  "^apps/web/src/modules/workspace/session/",
  "^apps/web/vite\\.config\\.",
  "^\\.github/workflows/(ci|verify-desktop|release|release-desktop|publish-desktop)\\.yml$",
  "^Taskfile\\.yml$",
  "^package\\.json$",
  "^bun\\.lock$",
].join("|"));

const isNativePath = (path) => NATIVE_MATCH.test(path) && !SERVER_TEST_ONLY.test(path) && !WEB_UNIT_ONLY.test(path) && !RELEASE_POLICY_ONLY.test(path);
const isPureDocsPath = (path) => DOCS.test(path) && !DESKTOP_BETA_NOTE.test(path);
const allLanes = (value) => Object.fromEntries(LANES.map((lane) => [lane, value]));

function addPathLanes(plan, path) {
  if (isNativePath(path)) plan.desktop = true;
  if (RELEASE_POLICY.test(path)) plan["release-policy"] = true;

  if (README_CONTRACT.test(path)) {
    plan.landing = true;
    return true;
  }
  if (isPureDocsPath(path)) return true;
  if (DESKTOP_BETA_NOTE.test(path)) {
    plan.desktop = true;
    plan["release-policy"] = true;
    return true;
  }
  if (LANDING.test(path)) {
    plan.landing = true;
    return true;
  }
  if (WEB_UNIT_ONLY.test(path)) {
    plan.web = true;
    return true;
  }
  if (WEB_E2E.test(path)) {
    plan.web = true;
    plan.browser = true;
    return true;
  }
  if (WEB_APP.test(path)) {
    plan.web = true;
    plan.browser = true;
    if (WEB_SETTINGS.test(path)) plan.landing = true;
    return true;
  }
  if (SERVER_TEST_ONLY.test(path)) {
    plan.server = true;
    return true;
  }
  if (SERVER_APP.test(path)) {
    plan.server = true;
    plan.browser = true;
    plan.compose = true;
    return true;
  }
  if (DESKTOP_APP.test(path)) {
    plan.desktop = true;
    plan["release-policy"] = true;
    return true;
  }
  if (COMPOSE.test(path)) {
    plan.compose = true;
    return true;
  }
  if (RELEASE_POLICY_ONLY.test(path)) {
    plan["release-policy"] = true;
    return true;
  }
  if (NATIVE_SCRIPTS.test(path)) {
    plan.desktop = true;
    plan["release-policy"] = true;
    return true;
  }
  if (WEB_SCRIPTS.test(path)) {
    plan.web = true;
    plan.browser = true;
    plan["release-policy"] = true;
    return true;
  }
  if (SERVER_SCRIPTS.test(path)) {
    plan.server = true;
    plan["release-policy"] = true;
    return true;
  }
  if (CI_PLAN_SCRIPTS.test(path)) {
    plan["release-policy"] = true;
    return true;
  }
  if (WORKFLOW_DESKTOP_OR_RELEASE.test(path)) {
    plan.desktop = true;
    plan["release-policy"] = true;
    return true;
  }
  // Shared root config (package.json, bun.lock, ci.yml, Taskfile.yml) or unknown path.
  return false;
}

// Pure decision: `paths` is the changed-path list for PR or master push, or null when unknown.
export function selectLanes(event, paths, { candidateTarget = "" } = {}) {
  if (event === "schedule") return allLanes(true);
  if (event === "workflow_dispatch") {
    const target = typeof candidateTarget === "string" ? candidateTarget.trim() : "";
    if (!target || target === "regression") return allLanes(true);
    if (!Object.hasOwn(CANDIDATE_TARGET_LANES, target)) {
      throw new Error(`Unknown CI candidate target: ${target}`);
    }
    const targetLanes = new Set(CANDIDATE_TARGET_LANES[target]);
    return Object.fromEntries(LANES.map((lane) => [lane, targetLanes.has(lane)]));
  }
  if (event === "push") {
    if (!Array.isArray(paths) || paths.length === 0) return allLanes(true);
    if (paths.every(isPureDocsPath)) {
      return { ...allLanes(false), landing: paths.some((path) => README_CONTRACT.test(path)) };
    }
    if (paths.every((path) => isPureDocsPath(path) || LANDING.test(path))) {
      return { ...allLanes(false), landing: true };
    }
    return allLanes(true);
  }
  if (event !== "pull_request") return allLanes(true);
  if (!Array.isArray(paths) || paths.length === 0) return allLanes(true);

  const plan = allLanes(false);
  for (const path of paths) {
    if (!addPathLanes(plan, path)) return allLanes(true);
  }
  return plan;
}

// Browser proof mode for this run. Unknown pull request diffs fall back to the full inventory.
export function browserMode(event, paths, { candidateTarget = "" } = {}) {
  if (event === "push") return "master";
  if (event === "workflow_dispatch") {
    const target = typeof candidateTarget === "string" ? candidateTarget.trim() : "";
    if (Object.hasOwn(CANDIDATE_TARGET_LANES, target)) return "master";
    return "full";
  }
  if (event !== "pull_request") return "full";
  return Array.isArray(paths) && paths.length > 0 ? "affected" : "full";
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Strict gate schema: exact known lane keys, boolean selections, successful classifier,
// and every selected lane must succeed while unselected lanes may only be skipped or succeed.
export function assertGate(plan, needs) {
  if (!isPlainObject(plan)) throw new Error("Invalid lane plan: expected plain object");
  if (!isPlainObject(needs)) throw new Error("Invalid job needs: expected plain object");
  for (const key of Object.keys(plan)) {
    if (!LANES.includes(key)) throw new Error(`Unknown lane in plan: ${key}`);
  }
  for (const lane of LANES) {
    if (!Object.hasOwn(plan, lane)) throw new Error(`Missing lane in plan: ${lane}`);
    if (typeof plan[lane] !== "boolean") throw new Error(`Invalid lane selection for ${lane}: expected boolean`);
  }
  if (!isPlainObject(needs.classify) || needs.classify.result !== "success") {
    throw new Error(`Lane classifier did not succeed (result=${isPlainObject(needs.classify) ? (needs.classify.result ?? "missing") : "missing"})`);
  }
  for (const lane of LANES) {
    const result = isPlainObject(needs[lane]) ? needs[lane].result : undefined;
    if (typeof result !== "string" || !result) {
      throw new Error(`${lane}: ${plan[lane] ? "selected" : "unselected"} lane ended missing`);
    }
    if (plan[lane] && result !== "success") throw new Error(`${lane}: selected lane ended ${result}`);
    if (!plan[lane] && !["skipped", "success"].includes(result)) throw new Error(`${lane}: unselected lane ended ${result}`);
  }
  return plan;
}

const root = resolve(import.meta.dirname, "../..");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
const event = process.env.GITHUB_EVENT_NAME ?? "";
const output = (key, value) => appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);

// Changed paths between the base commit and HEAD. Renames are expanded to
// delete+add so both old and new owners are seen. Unreadable/zero SHAs yield null.
function changedPaths() {
  const base = event === "pull_request"
    ? (process.env.BASE_SHA ?? "")
    : event === "push"
      ? (process.env.BEFORE_SHA ?? "")
      : "";
  if (!/^[a-f0-9]{40}$/.test(base) || /^0{40}$/.test(base)) return null;
  try {
    const paths = git("diff", "--name-only", "-z", "--no-renames", base, "HEAD", "--").split("\0").filter(Boolean);
    return paths.length ? paths : null;
  } catch {
    return null;
  }
}

function main(command) {
  const candidateTarget = (process.env.CANDIDATE_TARGET ?? "").trim();
  switch (command) {
    case "plan": {
      const paths = event === "pull_request" || event === "push" ? changedPaths() : null;
      const plan = selectLanes(event, paths, { candidateTarget });
      output("plan", JSON.stringify(plan));
      for (const [lane, selected] of Object.entries(plan)) output(lane.replaceAll("-", "_"), String(selected));
      console.log(JSON.stringify(plan));
      break;
    }
    case "mode": {
      const paths = event === "pull_request" ? changedPaths() : null;
      const mode = browserMode(event, paths, { candidateTarget });
      if (mode === "affected") writeFileSync(process.env.CHANGED_FILES, JSON.stringify(paths));
      console.log(mode);
      break;
    }
    case "gate": {
      if (!process.env.NEEDS) throw new Error("Missing NEEDS job context");
      const needs = JSON.parse(process.env.NEEDS);
      const rawPlan = needs?.classify?.outputs?.plan;
      if (typeof rawPlan !== "string" || !rawPlan.trim()) throw new Error("Missing lane plan");
      const plan = JSON.parse(rawPlan);
      assertGate(plan, needs);
      console.log(`CI gate passed: ${LANES.filter((lane) => plan[lane]).join(", ") || "docs only"}`);
      break;
    }
    default:
      throw new Error("Expected one command: plan | mode | gate");
  }
}

// Run the CLI only when executed directly; the policy functions are imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv[2]);
