// Publication authority: current master, latest push ci, actual aggregate gate + target lane proofs.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import process from "node:process";

export const REQUIRED_DESKTOP_WORKFLOWS = ["ci"];
export const TARGET_REQUIRED_JOBS = {
  gate: ["ci / gate"],
  desktop: ["ci / gate", "web", "server", "browser", "desktop / check-desktop", "desktop / check-desktop-windows"],
  image: ["ci / gate", "web", "server", "browser", "compose"],
  cloudflare: ["ci / gate", "landing"],
};
const repositoryPattern = /^[a-z0-9][a-z0-9_.-]*\/[a-z0-9][a-z0-9_.-]*$/i;
const positiveId = (value) => Number.isSafeInteger(value) && value > 0;

function assertRunIdentity(run, repository, ids) {
  if (run.path !== ".github/workflows/ci.yml" || run.repository?.full_name !== repository || run.head_repository?.full_name !== repository) throw new Error("CI workflow/repository identity mismatch");
  if (!positiveId(run.id) || !positiveId(run.run_attempt) || ids.has(run.id)) throw new Error("Invalid or duplicate CI run identity");
}

function selectMasterRun(payload, sha, repository) {
  const runs = payload?.workflow_runs;
  if (!Array.isArray(runs)) throw new Error("Could not read CI workflow runs");
  const matching = runs.filter((run) => run?.name === REQUIRED_DESKTOP_WORKFLOWS[0] && run.event === "push" && run.head_branch === "master" && run.head_sha === sha);
  const ids = new Set();
  for (const run of matching) {
    assertRunIdentity(run, repository, ids);
    ids.add(run.id);
  }
  const newest = matching.sort((a, b) => b.id - a.id)[0];
  if (!newest) throw new Error(`Missing master push ci for ${sha}`);
  return newest;
}

function assertJobIdentity(job, run, sha, name) {
  if (job.run_id !== run.id || job.run_attempt !== run.run_attempt || job.head_sha !== sha) {
    throw new Error(`${name} belongs to stale run/attempt/SHA`);
  }
  if (job.status !== "completed" || job.conclusion !== "success") {
    throw new Error(`Required ${name} did not succeed (status=${job.status}, conclusion=${job.conclusion}); release blocked`);
  }
}

export function assertDesktopReleaseChecks(payload, expectedSha, repository, { target = "gate" } = {}) {
  assert.match(expectedSha, /^[a-f0-9]{40}$/, "Expected full master commit SHA");
  assert.match(repository, repositoryPattern, "Expected repository identity");
  const requiredJobs = TARGET_REQUIRED_JOBS[target];
  if (!requiredJobs) throw new Error(`Unknown release CI target: ${target}`);
  if (payload?.master_sha !== expectedSha) throw new Error("Master advanced or current-master evidence is missing");
  const run = selectMasterRun(payload, expectedSha, repository);
  if (run.status !== "completed" || run.conclusion !== "success") throw new Error("Latest master push ci has not succeeded; release blocked");
  const jobs = payload.jobs;
  if (!Array.isArray(jobs?.jobs) || jobs.total_count !== jobs.jobs.length) throw new Error("Incomplete CI job evidence");
  for (const name of requiredJobs) {
    const matches = jobs.jobs.filter((job) => job.name === name);
    if (matches.length !== 1) throw new Error(`Missing or duplicate required ${name} for ${target} release`);
    assertJobIdentity(matches[0], run, expectedSha, name);
  }
}

function collectChecks(expectedSha, repository) {
  assert.match(expectedSha, /^[a-f0-9]{40}$/, "Expected full master commit SHA");
  assert.match(repository, repositoryPattern, "Expected repository identity");
  const api = (path) => JSON.parse(execFileSync("gh", ["api", `repos/${repository}/${path}`], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }));
  const master = () => api("git/ref/heads/master").object.sha;
  if (master() !== expectedSha) throw new Error("Master advanced; retry on current HEAD");
  const path = `actions/workflows/ci.yml/runs?head_sha=${expectedSha}&event=push&branch=master&per_page=100`;
  const run = selectMasterRun(api(path), expectedSha, repository);
  const jobs = api(`actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`);
  const payload = api(path); // New runs/reruns cannot inherit the earlier gate.
  payload.jobs = jobs;
  payload.master_sha = master();
  return payload;
}

function parseCliArgs(argv) {
  const args = argv.slice(2);
  let target = "gate";
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--target") {
      if (i + 1 >= args.length) throw new Error("Missing value for --target");
      target = args[++i];
      continue;
    }
    positional.push(args[i]);
  }
  if (positional.length !== 2) throw new Error("Expected --collect <SHA> or <evidence.json> <SHA> [--target <gate|desktop|image|cloudflare>]");
  return { source: positional[0], sha: positional[1], target };
}

if (import.meta.main) {
  const { source, sha, target } = parseCliArgs(process.argv);
  const repository = process.env.GITHUB_REPOSITORY;
  const payload = source === "--collect" ? collectChecks(sha, repository) : JSON.parse(readFileSync(source, "utf8"));
  assertDesktopReleaseChecks(payload, sha, repository, { target });
  console.log(`Current master ${sha}: latest push ci and exact-attempt ci / gate (${target}) passed`);
}
