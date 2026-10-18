// Gate desktop publication on passing push checks for the *exact* master SHA.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

export const REQUIRED_DESKTOP_WORKFLOWS = ["Verify", "Verify Desktop"];

export function assertDesktopReleaseChecks(payload, expectedSha) {
  assert.match(expectedSha, /^[a-f0-9]{40}$/, "Expected full master commit SHA");
  if (!payload || !Array.isArray(payload.workflow_runs)) {
    throw new Error("Could not read GitHub Actions workflow runs");
  }
  const runs = payload.workflow_runs.filter((run) =>
    run?.head_sha === expectedSha && run.event === "push"
  );
  for (const name of REQUIRED_DESKTOP_WORKFLOWS) {
    const matching = runs.filter((run) => run.name === name)
      .sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
    const newest = matching[0];
    if (!newest) throw new Error(`Missing master push verification: ${name} for ${expectedSha}`);
    if (newest.status !== "completed" || newest.conclusion !== "success") {
      throw new Error(`${name} on master is ${newest.status}/${newest.conclusion ?? "pending"}; release blocked`);
    }
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const payload = JSON.parse(readFileSync(process.argv[2], "utf8"));
  assertDesktopReleaseChecks(payload, process.argv[3]);
  console.log("Required master push CI passed for exact release commit");
}
