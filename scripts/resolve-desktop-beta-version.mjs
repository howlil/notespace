// First-party unsigned desktop beta versioning; no code-signing services.
// Published tags are the authority. Existing prerelease tags are handled
// separately by the CI tag-collision gate.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const BETA_TAG = /^v0\.1\.0-beta\.([1-9]\d*)$/;

export function nextFreeDesktopBetaTag(releases) {
  if (!Array.isArray(releases)) throw new Error("Expected GitHub Releases JSON array");
  let highest = 0;
  for (const release of releases) {
    if (!release || release.isDraft || typeof release.tagName !== "string") continue;
    const match = BETA_TAG.exec(release.tagName);
    if (!match) continue;
    const value = Number(match[1]);
    if (!Number.isSafeInteger(value)) throw new Error("Invalid desktop beta sequence");
    highest = Math.max(highest, value);
  }
  if (!Number.isSafeInteger(highest + 1) || highest + 1 > 65535) {
    throw new Error("Desktop beta sequence exceeds Windows MSI ProductVersion limit");
  }
  return `v0.1.0-beta.${highest + 1}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const releases = JSON.parse(readFileSync(0, "utf8"));
  process.stdout.write(nextFreeDesktopBetaTag(releases) + "\n");
}
