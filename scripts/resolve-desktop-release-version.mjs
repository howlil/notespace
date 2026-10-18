// Pure, deterministic SemVer selector for manually dispatched desktop releases.
// Input: GitHub Releases JSON from gh release list; output: exactly one vX.Y.Z tag.
import { readFileSync } from "node:fs";

const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function components(version) {
  if (!VERSION.test(version)) throw new Error(`Invalid stable SemVer version: ${version}`);
  return version.split(".").map((part) => {
    const value = Number(part);
    if (!Number.isSafeInteger(value)) throw new Error(`SemVer component exceeds safe integer: ${version}`);
    return value;
  });
}

function compareVersions(a, b) {
  const aa = components(a), bb = components(b);
  for (let i = 0; i < aa.length; i++) {
    if (aa[i] !== bb[i]) return aa[i] > bb[i] ? 1 : -1;
  }
  return 0;
}

export function resolveDesktopVersion(releases, { bump = "patch", requestedVersion = "" } = {}) {
  if (!Array.isArray(releases)) throw new Error("GitHub release listing must be an array");
  if (!["patch", "minor", "major"].includes(bump)) throw new Error(`Unsupported version increment: ${bump}`);
  const published = releases
    .filter((release) => release && !release.isDraft && !release.isPrerelease
      && typeof release.tagName === "string" && /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(release.tagName))
    .map((release) => release.tagName.slice(1));
  published.sort(compareVersions);
  const latest = published.at(-1);

  const override = requestedVersion.trim().replace(/^v/, "");
  if (override) {
    components(override);
    if (latest && compareVersions(override, latest) <= 0) {
      throw new Error(`Requested ${override} must be newer than published release ${latest}`);
    }
    return `v${override}`;
  }

  // No previous public stable release: begin at v1.0.0 irrespective of bump mode.
  if (!latest) return "v1.0.0";
  let [major, minor, patch] = components(latest);
  if (bump === "major") { major++; minor = 0; patch = 0; }
  else if (bump === "minor") { minor++; patch = 0; }
  else { patch++; }
  const next = [major, minor, patch];
  if (!next.every(Number.isSafeInteger)) throw new Error("Release version would overflow safe integer");
  return `v${next.join(".")}`;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const releases = JSON.parse(readFileSync(0, "utf8"));
  const tag = resolveDesktopVersion(releases, {
    bump: process.argv[2] || "patch",
    requestedVersion: process.argv[3] || "",
  });
  process.stdout.write(`${tag}\n`);
}
