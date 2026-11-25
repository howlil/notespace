// Publication authority: current master, latest push ci / gate, plus target lane proofs
// from that exact push run or an explicit exact-SHA candidate / <target> run (never generic regression).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import process from "node:process";

export const REQUIRED_DESKTOP_WORKFLOWS = ["ci"];
export const TARGET_REQUIRED_JOBS = {
  gate: ["ci / gate"],
  desktop: ["ci / gate", "web", "server", "browser", "desktop / check-desktop", "desktop / check-desktop-windows"],
  image: ["ci / gate", "web", "server", "browser", "compose"],
};
export const candidateRunTitle = (target) => `ci candidate (${target})`;
export const candidateGateName = (target) => `candidate / ${target}`;
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

function selectCandidateRun(runsPayload, sha, repository, target) {
  const runs = Array.isArray(runsPayload) ? runsPayload : runsPayload?.workflow_runs;
  if (!Array.isArray(runs)) return null;
  const expectedTitle = candidateRunTitle(target);
  const matching = runs.filter((run) => (
    run?.name === REQUIRED_DESKTOP_WORKFLOWS[0]
    && run.event === "workflow_dispatch"
    && run.head_branch === "master"
    && run.head_sha === sha
    && run.display_title === expectedTitle
  ));
  const ids = new Set();
  for (const run of matching) {
    assertRunIdentity(run, repository, ids);
    ids.add(run.id);
  }
  return matching.sort((a, b) => b.id - a.id)[0] ?? null;
}

function assertJobIdentity(job, run, sha, name) {
  if (job.run_id !== run.id || job.run_attempt !== run.run_attempt || job.head_sha !== sha) {
    throw new Error(`${name} belongs to stale run/attempt/SHA`);
  }
  if (job.status !== "completed" || job.conclusion !== "success") {
    throw new Error(`Required ${name} did not succeed (status=${job.status}, conclusion=${job.conclusion}); release blocked`);
  }
}

function assertExactJob(jobs, run, sha, name, label) {
  const matches = jobs.filter((job) => job.name === name);
  if (matches.length !== 1) throw new Error(`Missing or duplicate required ${name} for ${label}`);
  assertJobIdentity(matches[0], run, sha, name);
}

function pushHasTargetJobs(jobs, run, sha, targetJobs) {
  let missingOrSkipped = false;
  for (const name of targetJobs) {
    const matches = jobs.filter((job) => job.name === name);
    if (matches.length > 1) throw new Error(`Missing or duplicate required ${name} for release`);
    if (matches.length === 0) {
      missingOrSkipped = true;
      continue;
    }
    const job = matches[0];
    if (job.run_id !== run.id || job.run_attempt !== run.run_attempt || job.head_sha !== sha) {
      throw new Error(`${name} belongs to stale run/attempt/SHA`);
    }
    if (job.status === "completed" && job.conclusion === "skipped") {
      missingOrSkipped = true;
      continue;
    }
    if (job.status !== "completed" || job.conclusion !== "success") {
      throw new Error(`Required ${name} did not succeed (status=${job.status}, conclusion=${job.conclusion}); release blocked`);
    }
  }
  return !missingOrSkipped;
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
  assertExactJob(jobs.jobs, run, expectedSha, "ci / gate", `${target} release`);

  const targetJobs = requiredJobs.filter((name) => name !== "ci / gate");
  if (targetJobs.length === 0) return { source: "push", runId: run.id };
  if (pushHasTargetJobs(jobs.jobs, run, expectedSha, targetJobs)) return { source: "push", runId: run.id };

  const candidateRun = selectCandidateRun(payload.candidate_runs ?? payload.workflow_runs, expectedSha, repository, target);
  if (!candidateRun) {
    throw new Error(
      `Missing required ${target} lane proof on master push for ${expectedSha} and no passing ${candidateGateName(target)} run; `
      + `run: gh workflow run ci.yml --ref master -f candidate_target=${target}`,
    );
  }
  if (candidateRun.status !== "completed" || candidateRun.conclusion !== "success") {
    throw new Error(`Latest ${candidateGateName(target)} run has not succeeded; release blocked`);
  }
  const candidateJobs = payload.candidate_jobs;
  if (!Array.isArray(candidateJobs?.jobs) || candidateJobs.total_count !== candidateJobs.jobs.length) {
    throw new Error(`Incomplete ${candidateGateName(target)} job evidence`);
  }
  assertExactJob(candidateJobs.jobs, candidateRun, expectedSha, candidateGateName(target), `${target} candidate`);
  for (const name of targetJobs) {
    assertExactJob(candidateJobs.jobs, candidateRun, expectedSha, name, `${target} candidate`);
  }
  return { source: "candidate", runId: candidateRun.id, pushRunId: run.id };
}

function collectChecks(expectedSha, repository, target) {
  assert.match(expectedSha, /^[a-f0-9]{40}$/, "Expected full master commit SHA");
  assert.match(repository, repositoryPattern, "Expected repository identity");
  const requiredJobs = TARGET_REQUIRED_JOBS[target];
  if (!requiredJobs) throw new Error(`Unknown release CI target: ${target}`);
  const api = (path) => JSON.parse(execFileSync("gh", ["api", `repos/${repository}/${path}`], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }));
  const master = () => api("git/ref/heads/master").object.sha;
  if (master() !== expectedSha) throw new Error("Master advanced; retry on current HEAD");
  const pushPath = `actions/workflows/ci.yml/runs?head_sha=${expectedSha}&event=push&branch=master&per_page=100`;
  const run = selectMasterRun(api(pushPath), expectedSha, repository);
  const jobs = api(`actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`);

  const targetJobs = requiredJobs.filter((name) => name !== "ci / gate");
  let candidateRunsPayload = null;
  let candidateJobs = null;
  const needsCandidate = targetJobs.length > 0 && Array.isArray(jobs?.jobs) && !pushHasTargetJobs(jobs.jobs, run, expectedSha, targetJobs);
  if (needsCandidate) {
    const dispatchPath = `actions/workflows/ci.yml/runs?head_sha=${expectedSha}&event=workflow_dispatch&branch=master&per_page=100`;
    const candidateRun = selectCandidateRun(api(dispatchPath), expectedSha, repository, target);
    if (candidateRun) {
      candidateJobs = api(`actions/runs/${candidateRun.id}/attempts/${candidateRun.run_attempt}/jobs?per_page=100`);
    }
    candidateRunsPayload = api(dispatchPath); // New candidate runs/reruns cannot inherit earlier proof.
  }

  const payload = api(pushPath); // New push runs/reruns cannot inherit the earlier gate.
  payload.jobs = jobs;
  if (candidateRunsPayload) payload.candidate_runs = candidateRunsPayload.workflow_runs;
  if (candidateJobs) payload.candidate_jobs = candidateJobs;
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
  if (positional.length !== 2) throw new Error("Expected --collect <SHA> or <evidence.json> <SHA> [--target <gate|desktop|image>]");
  return { source: positional[0], sha: positional[1], target };
}

if (import.meta.main) {
  const { source, sha, target } = parseCliArgs(process.argv);
  const repository = process.env.GITHUB_REPOSITORY;
  const payload = source === "--collect" ? collectChecks(sha, repository, target) : JSON.parse(readFileSync(source, "utf8"));
  const result = assertDesktopReleaseChecks(payload, sha, repository, { target });
  const provenance = result.source === "candidate"
    ? `latest push ci / gate + exact-attempt ${candidateGateName(target)}`
    : `latest push ci and exact-attempt ci / gate (${target})`;
  console.log(`Current master ${sha}: ${provenance} passed`);
}
