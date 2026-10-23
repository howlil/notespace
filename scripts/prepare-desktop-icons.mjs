/* global console, process */
import { readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const tauriRoot = resolve(root, "apps/desktop/src-tauri");
const iconDir = resolve(tauriRoot, "icons", "fox-spirit");
const svgPath = resolve(root, "apps/web/public/brand/notespace-fox-full.svg");
// Keep the source in Git and rebuild assets before *every* native package.
// Generated into an ignored directory: building without this preparation must fail\n// instead of silently using the old checked-in Foldling icons.
const legacyIcoBlob = "d362692ebdded8a40151c853125a904169e1754a";
const legacyPngBlob = "81929fe324ef1472575d3d060976d7fd2cc11177";
const expectedOutputs = ["icon.ico", "icon.icns", "icon.png", "32x32.png", "128x128.png", "128x128@2x.png"];

function gitBlobHash(data) {
  return createHash("sha1").update(`blob ${data.length}\0`).update(data).digest("hex");
}
function assertPng(data, name, width) {
  if (data.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
      data.toString("ascii", 12, 16) !== "IHDR" ||
      data.readUInt32BE(16) !== width || data.readUInt32BE(20) !== width) {
    throw new Error(`Invalid ${name}: expected ${width}px square PNG`);
  }
}
function assertIco(data) {
  if (data.length < 200 || data.readUInt16LE(0) !== 0 || data.readUInt16LE(2) !== 1) {
    throw new Error("Invalid Windows ICO header");
  }
  const count = data.readUInt16LE(4);
  const sizes = new Set();
  for (let i = 0; i < count; i++) {
    const offset = 6 + i * 16;
    if (offset + 16 > data.length) throw new Error("Truncated Windows ICO entries");
    const size = data[offset] || 256;
    if (size !== (data[offset + 1] || 256)) throw new Error("Non-square Windows icon");
    const bytes = data.readUInt32LE(offset + 8);
    const start = data.readUInt32LE(offset + 12);
    if (start + bytes > data.length) throw new Error("Truncated Windows ICO payload");
    sizes.add(size);
  }
  for (const size of [16, 32, 256]) {
    if (!sizes.has(size)) throw new Error(`Windows ICO is missing ${size}px image`);
  }
}

export async function assertDesktopIcons() {
  const source = await readFile(svgPath, "utf8");
  if (!source.includes('viewBox="0 0 256 256"') ||
      !source.includes("#2858D8") || !source.includes("Notespace Fox Spirit")) {
    throw new Error("Desktop icon source must be the approved Cobalt Fox Spirit");
  }
  for (const file of expectedOutputs) {
    const path = resolve(iconDir, file);
    const data = await readFile(path);
    if ((await stat(path)).size === 0) throw new Error(`Empty native icon: ${file}`);
    if (file === "icon.ico") {
      assertIco(data);
      if (gitBlobHash(data) === legacyIcoBlob) throw new Error("Windows icon still uses the old Foldling asset");
    }
    if (file === "icon.icns" && data.toString("ascii", 0, 4) !== "icns") {
      throw new Error("Invalid macOS ICNS header");
    }
    if (file === "icon.png") {
      assertPng(data, file, 512);
      if (gitBlobHash(data) === legacyPngBlob) throw new Error("Desktop PNG still uses the old Foldling asset");
    }
    if (file === "32x32.png") assertPng(data, file, 32);
    if (file === "128x128.png") assertPng(data, file, 128);
    if (file === "128x128@2x.png") assertPng(data, file, 256);
  }
  console.log("Fox Spirit native icons verified: ICO, ICNS, and desktop PNGs");
}

async function main() {
  const result = spawnSync(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    ["dlx", "@tauri-apps/cli@2.12.3", "icon", svgPath, "--output", iconDir],
    { cwd: tauriRoot, stdio: "inherit", shell: process.platform === "win32" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Tauri icon generation failed: ${result.status}`);
  await assertDesktopIcons();
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
