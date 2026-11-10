// #200 A1: the classifier and gate share one owner/risk contract, never a permissive default.
// #200 M7 non-merging measurement probe: unchanged executable behavior.
export const CI_JOBS = ["web", "server", "landing", "browser", "desktop", "release-policy", "compose"];
const shaPattern = /^[a-f0-9]{40}$/;
export const validSha = (value) => typeof value === "string" && shaPattern.test(value);
const validPath = (path) => typeof path === "string" && path.length > 0 && !/[\0\\]/.test(path) && !/^(\/|[a-z]:)/i.test(path) && !path.split("/").some((part) => !part || part === "." || part === "..");

function statusPathCount(status) {
  if (typeof status !== "string") return 0;
  if (/^[AMDT]$/.test(status)) return 1;
  if (/^[RC]\d{1,3}$/.test(status) && Number(status.slice(1)) <= 100) return 2;
  return 0;
}

export function parseNameStatus(output) {
  if (!output || !output.endsWith("\0")) throw new Error("Empty/truncated git diff");
  const tokens = output.slice(0, -1).split("\0"), changes = [];
  while (tokens.length) {
    const status = tokens.shift();
    const count = statusPathCount(status);
    if (!count) throw new Error("Unsupported git status");
    const paths = tokens.splice(0, count);
    if (paths.length !== count || !paths.every(validPath)) throw new Error("Invalid/truncated git paths");
    changes.push({ status, paths });
  }
  return changes;
}

function completeDiff(diff) {
  if (diff.complete !== true || !validSha(diff.baseSha) || !validSha(diff.mergeBase)) return false;
  if (!Array.isArray(diff.changes) || !diff.changes.length) return false;
  return diff.changes.every(validChange);
}

function validChange(change) {
  if (!change || typeof change !== "object") return false;
  const { status, paths } = change;
  const count = statusPathCount(status);
  return count > 0 && Array.isArray(paths) && paths.length === count && paths.every(validPath);
}

function ownersFor(path) {
  // Tracked build output is suspicious, not a reason to skip source verification.
  if (/(^|\/)(dist|target|node_modules)\//.test(path) || /^tests\/e2e\/support\//.test(path)) return null;
  if (/^(docs\/|\.agents\/)|^(README|AGENTS|DESIGN|CHANGELOG)\.md$/.test(path)) return [];
  if (/^(landing\/|wrangler\.jsonc$)/.test(path)) return ["landing"];
  if (/^(apps\/desktop|scripts\/release)\//.test(path)) return ["desktop", "release-policy"];
  if (/^apps\/server\//.test(path)) return serverOwners(path);
  if (/^apps\/web\//.test(path)) return webOwners(path);
  if (/^tests\/e2e\//.test(path)) return ["web", "browser"];
  if (/^tests\/.*\.test\.tsx?$/.test(path)) return ["web"];
  return null; // Workflows, locks, tooling, shared and new owners require every gate.
}

function serverOwners(path) {
  if (path.endsWith("_test.go")) return ["server"];
  const native = /^apps\/server\/(cmd\/|migrations\/|internal\/(sqlite|workspace|library|asset|httpapi)\/|go\.(mod|sum)$)/.test(path);
  return native ? ["server", "browser", "desktop"] : ["server", "browser"];
}

function webOwners(path) {
  if (/\.test\.tsx?$/.test(path)) return ["web"];
  const native = [
    /^apps\/web\/(vite\.config\.|src\/routes\/__root)/,
    /^apps\/web\/src\/(features\/desktop|adapters\/(desktop|assets|http)|domain\/workspace)\//,
    /^apps\/web\/src\/features\/workspace-authoring\/(session\/|canvas\/(assets|state|sync)\/)/,
    /^apps\/web\/src\/features\/workspace-authoring\/canvas\/code\/(execution\/|use-canvas-code-runner\.ts$)/,
  ].some((owner) => owner.test(path));
  return native ? ["web", "browser", "desktop"] : ["web", "browser"];
}

export function ciStage(event = "pull_request") {
  const modes = { pull_request: "affected", push: "master", schedule: "full", workflow_dispatch: "full" };
  if (!Object.hasOwn(modes, event)) throw new Error("Unknown CI event/stage");
  return { event, browserMode: modes[event], full: event !== "pull_request" };
}

export function classifyDiff(diff) {
  if (!diff || !validSha(diff.sha)) throw new Error("CI requires an exact SHA");
  const stage = ciStage(diff.event);
  const complete = completeDiff(diff);
  const paths = complete ? [...new Set(diff.changes.flatMap(({ paths }) => paths))] : ["__incomplete_diff__"];
  const owners = paths.map(ownersFor), conservative = !complete || owners.includes(null);
  const selected = conservative || stage.full ? [...CI_JOBS] : [...new Set(owners.flat())];
  if (selected.includes("browser") && !selected.includes("web")) selected.push("web");
  return {
    sha: diff.sha,
    event: stage.event,
    browserMode: stage.browserMode,
    baseSha: diff.baseSha ?? null,
    conservative,
    paths,
    required: Object.fromEntries(CI_JOBS.map((job) => [job, selected.includes(job)])),
  };
}

export function assertCiGate(needs, observedDiff) {
  if (needs?.classify?.result !== "success") throw new Error("Classifier did not succeed");
  const expected = classifyDiff(observedDiff);
  const plan = JSON.parse(needs.classify.outputs?.plan ?? "null");
  if (JSON.stringify(plan) !== JSON.stringify(expected)) throw new Error("Classification/diff/SHA does not match fresh gate evidence");
  for (const job of CI_JOBS) assertJobResult(job, needs[job], expected);
  return expected;
}

function assertJobResult(job, outcome, plan) {
  const result = outcome?.result;
  if (!["success", "skipped"].includes(result)) throw new Error(`${job}: missing, failed or canceled result`);
  if (plan.required[job] && result !== "success") throw new Error(`${job}: required proof was skipped`);
  if (result === "success" && outcome.outputs?.sha !== plan.sha) throw new Error(`${job}: stale or missing SHA`);
}
