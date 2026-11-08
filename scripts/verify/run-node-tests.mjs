import process from "node:process";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const roots = [
  join(ROOT, "apps", "web", "src"),
  join(ROOT, "tests"),
];

function collectTests(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      files.push(...collectTests(path));
      continue;
    }
    if (/\.test\.(ts|tsx)$/.test(name)) files.push(path);
  }
  return files;
}

const tests = roots
  .flatMap(collectTests)
  .map((path) => relative(ROOT, path))
  .sort();

if (tests.length === 0) {
  throw new Error("No Node test files were discovered.");
}

const result = spawnSync(
  process.execPath,
  ["--experimental-strip-types", "--test", ...tests],
  { cwd: ROOT, stdio: "inherit" },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
