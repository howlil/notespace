// First-party unsigned desktop beta versioning; no code-signing services.
// Published tags are the authority. Existing prerelease tags are handled
// separately by the CI tag-collision gate.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const BETA_TAG = /^v0\.1\.0-beta\.([1-9]\d*)$/;

export function nextFreeDesktopBetaTag(releases, { existingTags = [] } = {}) {
  if (!Array.isArray(releases)) throw new Error("Expected GitHub Releases JSON array");
  if (!Array.isArray(existingTags) || existingTags.some((tag) => typeof tag !== "string")) {
    throw new Error("Existing Git tags must be an array of strings");
  }
  let highest = 0;
  const consider = (tagName) => {
    const match = BETA_TAG.exec(tagName);
    if (!match) return;
    const value = Number(match[1]);
    if (!Number.isSafeInteger(value)) throw new Error("Invalid desktop beta sequence");
    highest = Math.max(highest, value);
  };
  for (const release of releases) {
    if (!release || release.isDraft || typeof release.tagName !== "string") continue;
    consider(release.tagName);
  }
  for (const tag of existingTags) consider(tag);
  if (!Number.isSafeInteger(highest + 1) || highest + 1 > 65535) {
    throw new Error("Desktop beta sequence exceeds Windows MSI ProductVersion limit");
  }
  return `v0.1.0-beta.${highest + 1}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const releases = JSON.parse(readFileSync(0, "utf8"));
  const existingTags = process.argv[2] ? readFileSync(process.argv[2], "utf8").split(/\r?\n/).filter(Boolean) : [];
  process.stdout.write(nextFreeDesktopBetaTag(releases, { existingTags }) + "\n");
}
