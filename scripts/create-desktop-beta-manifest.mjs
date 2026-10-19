import { readFileSync, writeFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import process from "node:process";

export function createDesktopBetaManifest({ tag, msiPath, signaturePath, date = new Date() }) {
  if (!/^v0\.1\.0-beta\.[1-9][0-9]*$/.test(tag)) throw new Error("Invalid immutable beta tag");
  const name = basename(msiPath);
  if (!/^Notespace_0\.1\.0-beta\.[1-9][0-9]*_x64_en-US\.msi$/.test(name)
    || !name.includes(tag.slice(1))) {
    throw new Error("Update installer must match beta tag and Windows x64 target");
  }
  if (signaturePath !== msiPath + ".sig") throw new Error("Detached signature must match exact MSI path");
  if (statSync(msiPath).size < 1024) throw new Error("Installer must be a real MSI, not a placeholder");
  const signature = readFileSync(signaturePath, "utf8").trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(signature)) throw new Error("Updater signature is not base64");
  if (!Buffer.from(signature, "base64").toString("utf8").startsWith("untrusted comment: signature")) {
    throw new Error("Updater signature must contain a Tauri minisign signature box");
  }
  return {
    version: tag.slice(1),
    notes: "Signature-verified Notespace Desktop beta. The Windows installer remains Authenticode-unsigned.",
    pub_date: date.toISOString(),
    platforms: {
      "windows-x86_64": {
        signature,
        url: "https://github.com/howlil/notespace/releases/download/" + tag + "/" + encodeURIComponent(name),
      },
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [tag, msiPath, signaturePath, output] = process.argv.slice(2);
  if (!tag || !msiPath || !signaturePath || !output) {
    throw new Error("Usage: node scripts/create-desktop-beta-manifest.mjs <tag> <msi> <msi.sig> <latest.json>");
  }
  const manifest = createDesktopBetaManifest({ tag, msiPath, signaturePath });
  writeFileSync(output, JSON.stringify(manifest, null, 2) + "\n");
  console.log("Generated signed beta update manifest for " + manifest.version);
}
