import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseSha256Sums, verifyDesktopReleaseAssets } from "./verify-desktop-release-assets.mjs";

const REPO = "howlil/notespace";
const TAG = "v1.2.3";
const VERSION = "1.2.3";
const MSI_NAME = "Notespace_1.2.3_x64_en-US.msi";
const MSI_BYTES = Buffer.from("synthetic-signed-msi-payload");
const MSI_SHA256 = createHash("sha256").update(MSI_BYTES).digest("hex");
const SIG_TEXT = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk=";

function makeReleaseFixture({
  tag = TAG,
  version = VERSION,
  msiName = MSI_NAME,
  msiBytes = MSI_BYTES,
  sigText = SIG_TEXT,
  sha256SumsContent = null,
  manifestOverrides = {},
  releaseOverrides = {},
  extraFiles = [],
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "notespace-verify-release-"));
  const assetsDir = join(root, "assets");
  const candidatePath = join(root, `candidate-${msiName}`);
  spawnSync(process.execPath, ["-e", `require("fs").mkdirSync(${JSON.stringify(assetsDir)}, { recursive: true })`]);

  writeFileSync(candidatePath, MSI_BYTES);
  writeFileSync(join(assetsDir, msiName), msiBytes);
  writeFileSync(join(assetsDir, `${msiName}.sig`), `${sigText}\n`);
  writeFileSync(
    join(assetsDir, "SHA256SUMS.txt"),
    sha256SumsContent ?? `${MSI_SHA256.toUpperCase()}  ${msiName}\n`,
  );

  const manifest = {
    version,
    notes: `Notespace ${version}`,
    platforms: {
      "windows-x86_64": {
        signature: sigText,
        url: `https://github.com/${REPO}/releases/download/${tag}/${encodeURIComponent(msiName)}`,
      },
    },
    ...manifestOverrides,
  };
  writeFileSync(join(assetsDir, "latest.json"), JSON.stringify(manifest, null, 2) + "\n");

  for (const [name, content] of extraFiles) {
    writeFileSync(join(assetsDir, name), content);
  }

  const assetNames = [msiName, `${msiName}.sig`, "SHA256SUMS.txt", "latest.json", ...extraFiles.map(([n]) => n)];
  const release = {
    tagName: tag,
    isDraft: false,
    isPrerelease: false,
    assets: assetNames.map((name) => ({
      name,
      url: `https://github.com/${REPO}/releases/download/${tag}/${encodeURIComponent(name)}`,
    })),
    ...releaseOverrides,
  };

  return { root, assetsDir, candidatePath, release };
}

test("parseSha256Sums parses valid checksum lines and rejects malformed or duplicate entries", () => {
  const parsed = parseSha256Sums(`${MSI_SHA256.toUpperCase()}  ${MSI_NAME}\n`);
  assert.equal(parsed.get(MSI_NAME), MSI_SHA256);
  assert.throws(() => parseSha256Sums(""), /empty/);
  assert.throws(() => parseSha256Sums("not-a-sha256  file.msi\n"), /Malformed/);
  assert.throws(() => parseSha256Sums(`${MSI_SHA256}  ${MSI_NAME}\n${MSI_SHA256}  ${MSI_NAME}\n`), /Duplicate/);
  assert.throws(() => parseSha256Sums(`${MSI_SHA256}  ../evil.msi\n`), /Invalid asset filename/);
});

test("verifyDesktopReleaseAssets accepts valid published stable release and matching candidate MSI", async () => {
  const fixture = makeReleaseFixture();
  try {
    const result = await verifyDesktopReleaseAssets({
      release: fixture.release,
      assetsDir: fixture.assetsDir,
      expectedTag: TAG,
      candidateMsiPath: fixture.candidatePath,
      repository: REPO,
    });
    assert.deepEqual(result, {
      tag: TAG,
      version: VERSION,
      msiName: MSI_NAME,
      sha256: MSI_SHA256,
      url: `https://github.com/${REPO}/releases/download/${TAG}/${MSI_NAME}`,
    });
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("verifyDesktopReleaseAssets rejects prereleases, drafts, corrupted MSIs, and mismatched checksums/signatures/manifests", async () => {
  const cases = [
    ["prerelease tag", { tag: "v1.2.3-beta.1", expectedTag: "v1.2.3-beta.1" }, /stable SemVer/],
    ["release marked prerelease", { releaseOverrides: { isPrerelease: true } }, /prerelease/],
    ["release marked draft", { releaseOverrides: { isDraft: true } }, /draft/],
    ["corrupted downloaded MSI vs candidate", { msiBytes: Buffer.from("tampered-msi") }, /differs from attested candidate/],
    ["checksum mismatch in SHA256SUMS.txt", { sha256SumsContent: `${"0".repeat(64)}  ${MSI_NAME}\n` }, /SHA256SUMS\.txt mismatch/],
    ["empty signature file", { sigText: "   " }, /is empty/],
    ["duplicate .msi asset", { extraFiles: [["Notespace_extra.msi", "extra"]] }, /exactly one \.msi/],
    ["missing matching .msi.sig in metadata", {
      releaseOverrides: {
        assets: [
          { name: MSI_NAME },
          { name: "other.msi.sig" },
          { name: "SHA256SUMS.txt" },
          { name: "latest.json" },
        ],
      },
    }, /matching .*\.msi\.sig/],
    ["latest.json prerelease version", { manifestOverrides: { version: "1.2.3-beta.1" } }, /latest\.json version/],
    ["latest.json URL mismatch", {
      manifestOverrides: {
        platforms: { "windows-x86_64": { signature: SIG_TEXT, url: "https://attacker.example/Notespace.msi" } },
      },
    }, /latest\.json URL mismatch/],
    ["latest.json signature mismatch", {
      manifestOverrides: {
        platforms: { "windows-x86_64": { signature: "wrong-signature", url: `https://github.com/${REPO}/releases/download/${TAG}/${MSI_NAME}` } },
      },
    }, /latest\.json signature does not match/],
  ];

  for (const [label, options, pattern] of cases) {
    const fixture = makeReleaseFixture(options);
    try {
      await assert.rejects(
        () => verifyDesktopReleaseAssets({
          release: fixture.release,
          assetsDir: fixture.assetsDir,
          expectedTag: options.expectedTag ?? TAG,
          candidateMsiPath: fixture.candidatePath,
          repository: REPO,
        }),
        pattern,
        label,
      );
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }
});

test("verify-desktop-release-assets CLI reads UTF-8 BOM release JSON and fails closed on tampering", () => {
  const fixture = makeReleaseFixture();
  const script = fileURLToPath(new URL("./verify-desktop-release-assets.mjs", import.meta.url));
  const releaseJsonPath = join(fixture.root, "release.json");
  try {
    writeFileSync(releaseJsonPath, "\uFEFF" + JSON.stringify(fixture.release));
    const ok = spawnSync(
      process.execPath,
      [
        script,
        "--release-json", releaseJsonPath,
        "--assets-dir", fixture.assetsDir,
        "--tag", TAG,
        "--repository", REPO,
        "--candidate-msi", fixture.candidatePath,
      ],
      { encoding: "utf8" },
    );
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /Verified published release v1\.2\.3/);

    writeFileSync(join(fixture.assetsDir, "SHA256SUMS.txt"), `${"f".repeat(64)}  ${MSI_NAME}\n`);
    const bad = spawnSync(
      process.execPath,
      [
        script,
        "--release-json", releaseJsonPath,
        "--assets-dir", fixture.assetsDir,
        "--tag", TAG,
        "--repository", REPO,
      ],
      { encoding: "utf8" },
    );
    assert.notEqual(bad.status, 0);
    assert.match(bad.stderr, /SHA256SUMS\.txt mismatch/);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
