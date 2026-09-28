import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
const targetTriple = execFileSync("rustc", ["--print", "host-tuple"], {
  cwd: root,
  encoding: "utf8",
}).trim();

if (!targetTriple) {
  throw new Error("Unable to resolve Rust host target triple.");
}

const extension = process.platform === "win32" ? ".exe" : "";
const output = join(
  root,
  "apps",
  "desktop",
  "src-tauri",
  "binaries",
  `notespace-server-${targetTriple}${extension}`,
);

mkdirSync(dirname(output), { recursive: true });

execFileSync(
  "go",
  ["-C", "apps/server", "build", "-o", output, "./cmd/notespace"],
  { cwd: root, stdio: "inherit" },
);

if (process.platform !== "win32") {
  chmodSync(output, 0o755);
}

console.log(`Prepared Notespace sidecar: ${output}`);
