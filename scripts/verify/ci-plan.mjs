// Lean CI lane plan and gate.
// Pull requests select lanes by changed path; anything that cannot be proven
// docs-only or landing-only selects every lane. Master, schedule and manual
// runs always select every lane. ci / gate fails if a selected lane did not succeed.
import { appendFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";

export const LANES = ["web", "server", "browser", "landing", "desktop", "release-policy", "compose"];

const DOCS = /^(docs\/|\.agents\/|(README|AGENTS|DESIGN|CHANGELOG)\.md$)/;
const LANDING = /^(landing\/|wrangler\.jsonc$)/;
const RELEASE_POLICY = /^(scripts\/|\.github\/workflows\/|Taskfile\.yml$|package\.json$)/;
// Paths that can change the native Windows WebView2/sidecar/release proof.
const NATIVE = new RegExp([
  // Explicit release-note opt-ins must validate the exact commit before publication.
  "^docs/DESKTOP_BETA_RELEASE_",
  "^apps/desktop/",
  "^scripts/(release|dev|assets)/",
  "^scripts/verify/(desktop|native|smoke-desktop|assert-windows|check-desktop|test-desktop|prepare-native)",
  "^apps/server/(cmd|migrations|internal/sqlite)/",
  "^apps/web/src/(features/desktop|adapters/desktop|routes/__root)",
  "^apps/web/vite\\.config\\.",
  "^\\.github/workflows/",
  "^Taskfile\\.yml$",
  "^package\\.json$",
  "^bun\\.lock$",
].join("|"));

const allLanes = (value) => Object.fromEntries(LANES.map((lane) => [lane, value]));

// Pure decision: `paths` is the changed-path list for pull requests, or null when unknown.
export function selectLanes(event, paths) {
  if (event !== "pull_request") return allLanes(true);
  if (!Array.isArray(paths) || paths.length === 0) return allLanes(true);
  // Docs and landing changes never need the core app lanes.
  const landingOnly = paths.every((path) => DOCS.test(path) || LANDING.test(path));
  const core = !landingOnly;
  return {
    web: core,
    server: core,
    browser: core,
    compose: core,
    landing: paths.some((path) => LANDING.test(path)),
    desktop: paths.some((path) => NATIVE.test(path)),
    "release-policy": paths.some((path) => RELEASE_POLICY.test(path)),
  };
}

// Browser proof mode for this run. Unknown pull request diffs fall back to the full inventory.
export function browserMode(event, paths) {
  if (event === "push") return "master";
  if (event !== "pull_request") return "full";
  return Array.isArray(paths) && paths.length > 0 ? "affected" : "full";
}

// Every selected lane must succeed; an unselected lane may only be skipped.
export function assertGate(plan, needs) {
  if (needs?.classify?.result !== "success") throw new Error("Lane classifier did not succeed");
  for (const lane of LANES) {
    const result = needs[lane]?.result ?? "missing";
    if (plan[lane] && result !== "success") throw new Error(`${lane}: selected lane ended ${result}`);
    if (!plan[lane] && !["skipped", "success"].includes(result)) throw new Error(`${lane}: unselected lane ended ${result}`);
  }
  return plan;
}

const root = resolve(import.meta.dirname, "../..");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
const event = process.env.GITHUB_EVENT_NAME ?? "";
const output = (key, value) => appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);

// Changed paths between the PR base and the checked-out merge commit. Renames are
// expanded to delete+add so both old and new owners are seen. Errors yield null.
function changedPaths() {
  const base = process.env.BASE_SHA ?? "";
  if (!/^[a-f0-9]{40}$/.test(base)) return null;
  try {
    const paths = git("diff", "--name-only", "-z", "--no-renames", base, "HEAD", "--").split("\0").filter(Boolean);
    return paths.length ? paths : null;
  } catch {
    return null;
  }
}

function main(command) {
  switch (command) {
    case "plan": {
      const plan = selectLanes(event, event === "pull_request" ? changedPaths() : null);
      output("plan", JSON.stringify(plan));
      for (const [lane, selected] of Object.entries(plan)) output(lane.replaceAll("-", "_"), String(selected));
      console.log(JSON.stringify(plan));
      break;
    }
    case "mode": {
      const paths = event === "pull_request" ? changedPaths() : null;
      const mode = browserMode(event, paths);
      if (mode === "affected") writeFileSync(process.env.CHANGED_FILES, JSON.stringify(paths));
      console.log(mode);
      break;
    }
    case "gate": {
      const needs = JSON.parse(process.env.NEEDS);
      const plan = JSON.parse(needs.classify?.outputs?.plan ?? "null");
      if (!plan) throw new Error("Missing lane plan");
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
