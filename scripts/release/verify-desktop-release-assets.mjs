import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const STABLE_TAG_RE = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const STABLE_VERSION_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const MSI_NAME_RE = /^[-.\w ]+\.msi$/;
const REPOSITORY_RE = /^[a-z0-9][a-z0-9_.-]*\/[a-z0-9][a-z0-9_.-]*$/i;

const stripBom = (text) => text.replace(/^\uFEFF/, "");

async function sha256File(filePath) {
  const bytes = await readFile(filePath);
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Parse SHA256SUMS.txt into a map of filename -> lowercase SHA-256 hex digest.
 * Rejects malformed lines, invalid digests, and duplicate filenames.
 */
export function parseSha256Sums(content) {
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("SHA256SUMS.txt is empty");
  }
  const entries = new Map();
  for (const rawLine of stripBom(content).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = /^([a-fA-F0-9]{64})\s+\*?(.+)$/.exec(line);
    if (!match) {
      throw new Error(`Malformed SHA256SUMS.txt line: ${line}`);
    }
    const digest = match[1].toLowerCase();
    const filename = match[2].trim();
    if (!filename || filename.includes("/") || filename.includes("\\")) {
      throw new Error(`Invalid asset filename in SHA256SUMS.txt: ${filename}`);
    }
    if (entries.has(filename)) {
      throw new Error(`Duplicate SHA256SUMS.txt entry for ${filename}`);
    }
    entries.set(filename, digest);
  }
  if (entries.size === 0) {
    throw new Error("SHA256SUMS.txt has no checksum entries");
  }
  return entries;
}

function validateReleaseMetadata(release, expectedTag, repository) {
  if (!release || typeof release !== "object" || Array.isArray(release)) {
    throw new Error("Published release metadata must be a JSON object");
  }
  const tagName = release.tagName ?? release.tag_name;
  if (tagName !== expectedTag) {
    throw new Error(`Published release tag ${String(tagName)} does not match expected ${expectedTag}`);
  }
  if (release.isDraft === true || release.draft === true) {
    throw new Error("Published release cannot be a draft");
  }
  if (release.isPrerelease === true || release.prerelease === true) {
    throw new Error("Published release cannot be a prerelease");
  }
  if (!Array.isArray(release.assets)) {
    throw new Error("Published release metadata missing assets array");
  }

  for (const asset of release.assets) {
    if (!asset || typeof asset !== "object" || typeof asset.name !== "string" || !asset.name) {
      throw new Error("Published release contains malformed asset entry");
    }
    if (asset.state !== undefined && asset.state !== "uploaded") {
      throw new Error(`Release asset ${asset.name} is not uploaded (state=${asset.state})`);
    }
    const downloadUrl = asset.url ?? asset.browser_download_url;
    if (downloadUrl !== undefined) {
      const expectedUrl = `https://github.com/${repository}/releases/download/${expectedTag}/${encodeURIComponent(asset.name)}`;
      if (downloadUrl !== expectedUrl) {
        throw new Error(`Release asset ${asset.name} URL mismatch: ${downloadUrl}`);
      }
    }
  }

  const msiAssets = release.assets.filter((asset) => asset.name.endsWith(".msi"));
  if (msiAssets.length !== 1) {
    throw new Error(`Published release must contain exactly one .msi asset, found ${msiAssets.length}`);
  }
  const msiName = msiAssets[0].name;
  if (!MSI_NAME_RE.test(msiName)) {
    throw new Error(`Invalid published MSI filename: ${msiName}`);
  }

  const sigAssets = release.assets.filter((asset) => asset.name.endsWith(".sig"));
  if (sigAssets.length !== 1 || sigAssets[0].name !== `${msiName}.sig`) {
    throw new Error(`Published release must contain exactly one matching ${msiName}.sig asset`);
  }
  if (release.assets.filter((asset) => asset.name === "SHA256SUMS.txt").length !== 1) {
    throw new Error("Published release must contain exactly one SHA256SUMS.txt asset");
  }
  if (release.assets.filter((asset) => asset.name === "latest.json").length !== 1) {
    throw new Error("Published release must contain exactly one latest.json asset");
  }
  return msiName;
}

/**
 * Verify published GitHub desktop release metadata and downloaded assets:
 * - non-draft, non-prerelease stable SemVer tag
 * - exact 1 .msi, matching .msi.sig, SHA256SUMS.txt, and latest.json
 * - SHA-256 checksum match against downloaded (and optional candidate) MSI
 * - latest.json version, download URL, and signature consistency
 */
export async function verifyDesktopReleaseAssets({
  release,
  assetsDir,
  expectedTag,
  candidateMsiPath = "",
  repository = "howlil/notespace",
}) {
  if (!STABLE_TAG_RE.test(expectedTag)) {
    throw new Error(`Expected stable SemVer tag (vMAJOR.MINOR.PATCH), got ${expectedTag}`);
  }
  if (!REPOSITORY_RE.test(repository)) {
    throw new Error(`Invalid repository identity: ${repository}`);
  }
  if (!assetsDir) {
    throw new Error("assetsDir is required");
  }

  const expectedVersion = expectedTag.slice(1);
  const metadataMsiName = validateReleaseMetadata(release, expectedTag, repository);

  const entries = await readdir(assetsDir, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  const localMsis = files.filter((name) => name.endsWith(".msi"));
  if (localMsis.length !== 1 || localMsis[0] !== metadataMsiName) {
    throw new Error(`Downloaded assets must contain exactly ${metadataMsiName}, found ${JSON.stringify(localMsis)}`);
  }
  const localSigs = files.filter((name) => name.endsWith(".sig"));
  if (localSigs.length !== 1 || localSigs[0] !== `${metadataMsiName}.sig`) {
    throw new Error(`Downloaded assets must contain exactly ${metadataMsiName}.sig, found ${JSON.stringify(localSigs)}`);
  }
  if (!files.includes("SHA256SUMS.txt")) {
    throw new Error("Downloaded assets missing SHA256SUMS.txt");
  }
  if (!files.includes("latest.json")) {
    throw new Error("Downloaded assets missing latest.json");
  }

  const msiPath = join(assetsDir, metadataMsiName);
  const msiStats = await stat(msiPath);
  if (!msiStats.isFile() || msiStats.size === 0) {
    throw new Error(`Downloaded MSI ${metadataMsiName} is empty`);
  }

  const actualSha256 = await sha256File(msiPath);
  if (candidateMsiPath) {
    const candidateSha256 = await sha256File(candidateMsiPath);
    if (candidateSha256 !== actualSha256) {
      throw new Error(`Downloaded MSI SHA-256 (${actualSha256}) differs from attested candidate MSI (${candidateSha256})`);
    }
  }

  const checksums = parseSha256Sums(await readFile(join(assetsDir, "SHA256SUMS.txt"), "utf8"));
  const recordedSha256 = checksums.get(metadataMsiName);
  if (!recordedSha256) {
    throw new Error(`SHA256SUMS.txt is missing checksum entry for ${metadataMsiName}`);
  }
  if (recordedSha256 !== actualSha256) {
    throw new Error(`SHA256SUMS.txt mismatch for ${metadataMsiName}: expected ${recordedSha256}, actual ${actualSha256}`);
  }

  const sigText = stripBom(await readFile(join(assetsDir, `${metadataMsiName}.sig`), "utf8")).trim();
  if (!sigText) {
    throw new Error(`${metadataMsiName}.sig is empty`);
  }

  let manifest;
  try {
    manifest = JSON.parse(stripBom(await readFile(join(assetsDir, "latest.json"), "utf8")));
  } catch (err) {
    throw new Error(`Invalid latest.json: ${err.message}`);
  }
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("latest.json must be a JSON object");
  }
  if (!STABLE_VERSION_RE.test(manifest.version) || manifest.version !== expectedVersion) {
    throw new Error(`latest.json version ${String(manifest.version)} does not match expected ${expectedVersion}`);
  }
  const winPlatform = manifest.platforms?.["windows-x86_64"];
  if (!winPlatform || typeof winPlatform !== "object") {
    throw new Error("latest.json missing platforms.windows-x86_64");
  }
  const expectedUrl = `https://github.com/${repository}/releases/download/${expectedTag}/${encodeURIComponent(metadataMsiName)}`;
  if (winPlatform.url !== expectedUrl) {
    throw new Error(`latest.json URL mismatch: got ${String(winPlatform.url)}, expected ${expectedUrl}`);
  }
  if (typeof winPlatform.signature !== "string" || winPlatform.signature.trim() !== sigText) {
    throw new Error("latest.json signature does not match detached .msi.sig");
  }

  return {
    tag: expectedTag,
    version: expectedVersion,
    msiName: metadataMsiName,
    sha256: actualSha256,
    url: expectedUrl,
  };
}

function parseCliArgs(argv) {
  const args = argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];
    if (!flag?.startsWith("--") || value === undefined) {
      throw new Error("Usage: verify-desktop-release-assets.mjs --release-json <path> --assets-dir <dir> --tag <vX.Y.Z> [--repository <owner/repo>] [--candidate-msi <path>]");
    }
    parsed[flag.slice(2)] = value;
  }
  assert.ok(parsed["release-json"], "--release-json is required");
  assert.ok(parsed["assets-dir"], "--assets-dir is required");
  assert.ok(parsed.tag, "--tag is required");
  return parsed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseCliArgs(process.argv);
  const release = JSON.parse(stripBom(await readFile(args["release-json"], "utf8")));
  const verified = await verifyDesktopReleaseAssets({
    release,
    assetsDir: args["assets-dir"],
    expectedTag: args.tag,
    repository: args.repository || process.env.GITHUB_REPOSITORY || "howlil/notespace",
    candidateMsiPath: args["candidate-msi"] || "",
  });
  console.log(`Verified published release ${verified.tag}: ${verified.msiName} (sha256=${verified.sha256})`);
}
