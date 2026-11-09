// Bun recreates lookup aliases. Never archive Windows junction metadata.
import { lstatSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

export function prepareNativePackageCache(root) {
  if (!root) throw new Error("Bun package cache root is required");
  if (lstatSync(root).isSymbolicLink()) throw new Error("Cache root cannot be a junction");
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      // Unlink the entry, never stat/follow its target (including broken aliases).
      if (entry.isSymbolicLink()) rmSync(path);
      else if (entry.isDirectory()) walk(path);
      else if (!entry.isFile()) throw new Error(`Unsupported package cache entry: ${path}`);
    }
  }
  walk(realpathSync(root));
}

if (import.meta.main) {
  prepareNativePackageCache(process.env.BUN_INSTALL_CACHE_DIR);
  console.log("Native package snapshot contains regular files/directories only; aliases removed without following targets");
}
