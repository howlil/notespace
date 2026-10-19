import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";

// PE32 and PE32+ place the Windows subsystem at OptionalHeader + 0x44.
// 2 = Windows GUI; 3 = Windows console. Inspect the *real* output binaries,
// not source strings, so an incorrectly packaged MSI cannot silently pass.
export function windowsPESubsystem(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 0x40 || buffer.toString("ascii", 0, 2) !== "MZ") {
    throw new Error("Not a Windows PE executable (missing DOS header)");
  }
  const peOffset = buffer.readUInt32LE(0x3c);
  if (peOffset > buffer.length - 24 || buffer.toString("ascii", peOffset, peOffset + 4) !== "PE\0\0") {
    throw new Error("Not a Windows PE executable (missing PE header)");
  }
  const optionalStart = peOffset + 24;
  const optionalLength = buffer.readUInt16LE(peOffset + 20);
  if (optionalLength < 0x46 || optionalStart + optionalLength > buffer.length) {
    throw new Error("Invalid PE optional header");
  }
  const magic = buffer.readUInt16LE(optionalStart);
  if (magic !== 0x10b && magic !== 0x20b) {
    throw new Error(`Unsupported Windows PE optional header: ${magic}`);
  }
  return buffer.readUInt16LE(optionalStart + 0x44);
}

function assertWindowsGUI(executable) {
  const subsystem = windowsPESubsystem(readFileSync(executable));
  assert.equal(subsystem, 2,
    `${executable} must use the Windows GUI subsystem (2), got ${subsystem}; console windows can kill the desktop app`);
  process.stdout.write(`Windows GUI subsystem verified: ${executable}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const paths = process.argv.slice(2);
  if (!paths.length) throw new Error("Usage: node scripts/assert-windows-pe-subsystem.mjs <exe> [other.exe...]");
  for (const file of paths) assertWindowsGUI(file);
}
