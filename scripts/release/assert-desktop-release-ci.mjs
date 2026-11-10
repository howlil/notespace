// Publication authority: current master, latest push ci, actual aggregate job.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import process from "node:process";

export const REQUIRED_DESKTOP_WORKFLOWS = ["ci"];
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

function assertGateIdentity(gate, run, sha) {
  if (gate.run_id !== run.id || gate.run_attempt !== run.run_attempt || gate.head_sha !== sha) throw new Error("Gate belongs to stale run/attempt/SHA");
  if (gate.status !== "completed" || gate.conclusion !== "success") throw new Error("Required ci / gate did not succeed; release blocked");
}

export function assertDesktopReleaseChecks(payload, expectedSha, repository) {
  assert.match(expectedSha, /^[a-f0-9]{40}$/, "Expected full master commit SHA");
  assert.match(repository, repositoryPattern, "Expected repository identity");
  if (payload?.master_sha !== expectedSha) throw new Error("Master advanced or current-master evidence is missing");
  const run = selectMasterRun(payload, expectedSha, repository);
  if (run.status !== "completed" || run.conclusion !== "success") throw new Error("Latest master push ci has not succeeded; release blocked");
  const jobs = payload.jobs;
  if (!Array.isArray(jobs?.jobs) || jobs.total_count !== jobs.jobs.length) throw new Error("Incomplete CI job evidence");
  const gates = jobs.jobs.filter((job) => job.name === "ci / gate");
  if (gates.length !== 1) throw new Error("Missing or duplicate required ci / gate");
  assertGateIdentity(gates[0], run, expectedSha);
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

if (import.meta.main) {
  if (process.argv.length !== 4) throw new Error("Expected --collect <SHA> or <evidence.json> <SHA>");
  const repository = process.env.GITHUB_REPOSITORY;
  const sha = process.argv[3];
  const payload = process.argv[2] === "--collect" ? collectChecks(sha, repository) : JSON.parse(readFileSync(process.argv[2], "utf8"));
  assertDesktopReleaseChecks(payload, sha, repository);
  console.log(`Current master ${sha}: latest push ci and exact-attempt ci / gate passed`);
}
