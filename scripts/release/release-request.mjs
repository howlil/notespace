// Manual orchestration admission; publication authority remains exact-master ci.
import assert from "node:assert/strict";
import { appendFileSync } from "node:fs";
import { resolveDesktopVersion } from "./resolve-desktop-release-version.mjs";

const modes = new Set(["preflight", "desktop-beta", "desktop-stable", "image", "cloudflare"]);

export function releaseRequest({ mode = "preflight", bump = "patch", version = "", ref, sha }) {
  if (!modes.has(mode)) throw new Error("Unknown release mode");
  if (ref !== "refs/heads/master") throw new Error("Start release requests from master only");
  assert.match(sha, /^[a-f0-9]{40}$/, "Expected full source SHA");
  assert.equal(typeof version, "string", "Expected version string");
  if (!["patch", "minor", "major"].includes(bump)) throw new Error("Invalid release increment");
  if (mode !== "desktop-stable" && bump !== "patch") throw new Error("Increment applies only to desktop-stable");
  assertVersion(mode, version);
  return mode;
}

function assertVersion(mode, version) {
  if (mode === "desktop-stable") {
    if (version) resolveDesktopVersion([], { requestedVersion: version });
    return;
  }
  if (mode === "image") {
    if (version && (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version) || version.trim() !== version)) throw new Error("Image version must be a stable source tag");
    return;
  }
  if (version) throw new Error("Version input applies only to desktop-stable or image");
}

if (import.meta.main) {
  if (process.argv.length !== 2) throw new Error("Release request takes environment inputs only");
  const mode = releaseRequest({ mode: process.env.MODE, bump: process.env.RELEASE_BUMP, version: process.env.RELEASE_VERSION, ref: process.env.GITHUB_REF, sha: process.env.GITHUB_SHA });
  if (!process.env.GITHUB_OUTPUT) throw new Error("Missing GITHUB_OUTPUT");
  appendFileSync(process.env.GITHUB_OUTPUT, `mode=${mode}\n`);
}
