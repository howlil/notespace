import { appendFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";
import { assertCiGate, classifyDiff, parseNameStatus, validSha } from "./ci-policy.mjs";

const root = resolve(import.meta.dirname, "../..");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
const sha = process.env.EXPECTED_SHA;
if (!validSha(sha) || git("rev-parse", "HEAD").trim() !== sha) throw new Error("Checkout does not match expected exact SHA");
const output = (key, value) => appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);

function collectDiff() {
  const baseSha = process.env.BASE_SHA ?? null;
  const unavailable = { sha, baseSha, event: process.env.CI_EVENT, complete: false, changes: [] };
  if (!validSha(baseSha)) return unavailable;
  try {
    const mergeBase = git("merge-base", baseSha, sha).trim();
    if (!validSha(mergeBase)) return unavailable;
    const changes = parseNameStatus(git("diff", "--no-ext-diff", "--no-textconv", "--ignore-submodules=none", "--find-renames", "--name-status", "-z", mergeBase, sha, "--"));
    return { ...unavailable, mergeBase, complete: true, changes };
  } catch {
    // Missing history, unavailable base, unsupported status or truncated output
    // selects every owner. Checkout identity failure above is never swallowed.
    return unavailable;
  }
}

if (process.argv.length !== 3) throw new Error("Expected exactly one CI command");
switch (process.argv[2]) {
  case "identity":
    output("sha", sha);
    break;
  case "classify": {
    const plan = classifyDiff(collectDiff());
    output("plan", JSON.stringify(plan));
    for (const [job, required] of Object.entries(plan.required)) output(job.replaceAll("-", "_"), String(required));
    console.log(JSON.stringify(plan));
    break;
  }
  case "browser-mode":
    console.log(classifyDiff(collectDiff()).browserMode);
    break;
  case "paths": {
    const plan = classifyDiff(collectDiff());
    writeFileSync(process.env.CHANGED_FILES, JSON.stringify(plan.paths));
    break;
  }
  case "gate": {
    const plan = assertCiGate(JSON.parse(process.env.CI_NEEDS), collectDiff());
    console.log(`CI gate passed for ${plan.sha}: ${Object.entries(plan.required).filter(([, required]) => required).map(([job]) => job).join(", ") || "docs only"}`);
    break;
  }
  default:
    throw new Error("Unknown CI command");
}
