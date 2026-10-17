import { readFile, writeFile, readdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { pathToFileURL } from "node:url";

export function createUpdateManifest(version, files) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error("Updater publication requires stable, numeric SemVer");
  }
  if (files.length !== 1 || !files[0].name.endsWith(".msi")) {
    throw new Error("Expected precisely one signed Windows MSI");
  }
  const { name, signature } = files[0];
  if (!signature || !signature.trim() || !/^[-.\w ]+\.msi$/.test(name)) {
    throw new Error("Invalid updater signature or MSI asset name");
  }
  return {
    version,
    notes: `Notespace ${version}`,
    platforms: {
      "windows-x86_64": {
        signature: signature.trim(),
        url: `https://github.com/howlil/notespace/releases/download/v${version}/${encodeURIComponent(name)}`,
      },
    },
  };
}

export async function writeManifest(bundleDirectory, version) {
  const files = await readdir(bundleDirectory, { withFileTypes: true, recursive: true });
  const candidates = files.filter((x) => x.isFile() && x.name.endsWith(".msi"));
  if (candidates.length !== 1) throw new Error(`Expected one MSI, found ${candidates.length}`);
  // Node v24 supplies parentPath on recursive Dirent objects.
  const file = candidates[0];
  const msiDir = file.parentPath ?? file.path;
  const signature = await readFile(join(msiDir, file.name + ".sig"), "utf8");
  const manifest = createUpdateManifest(version, [{ name: basename(file.name), signature }]);
  const result = join(bundleDirectory, "latest.json");
  await writeFile(result, JSON.stringify(manifest, null, 2) + "\n", { flag: "w" });
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , bundleDir, version] = process.argv;
  if (!bundleDir || !version) throw new Error("Usage: node scripts/create-desktop-update-manifest.mjs <bundle-dir> <stable-version>");
  console.log(await writeManifest(bundleDir, version));
}
