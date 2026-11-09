// Archive package downloads, never installed Windows workspace junctions.
import { lstatSync, readdirSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import process from "node:process";

export function assertNativeDependencyCache(root) {
  if (!root) throw new Error("Bun package cache root is required");
  if (lstatSync(root).isSymbolicLink()) throw new Error("Cache root cannot be a junction");
  const base = realpathSync(root);
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        const name = relative(base, realpathSync(path));
        if (isAbsolute(name) || name === ".." || name.startsWith(`..${sep}`)) {
          throw new Error(`Package cache link escapes into source/data: ${path}`);
        }
      } else if (entry.isDirectory()) walk(path);
    }
  }
  walk(base);
}

if (import.meta.main) {
  assertNativeDependencyCache(process.env.BUN_INSTALL_CACHE_DIR);
  console.log("Native package cache contains no external workspace/profile links");
}
