import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export function discoverBrowserSuites(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return discoverBrowserSuites(path);
    return entry.isFile() && entry.name.endsWith(".e2e.mjs") ? [path] : [];
  }).sort();
}

export function selectBrowserSuites(root, { file = null, critical = false } = {}) {
  if (file) return [resolve(root, file)];
  const suites = discoverBrowserSuites(join(root, "tests", "e2e"));
  return critical ? suites.filter((path) => /\btest\(\s*["']critical:/.test(readFileSync(path, "utf8"))) : suites;
}
