// Never archive a workspace/profile through dependency-directory junctions.
import { lstatSync, readdirSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export function assertNativeDependencyCache(root) {
  const roots = ["node_modules", "apps/web/node_modules"].map((name) => {
    const path = join(root, name);
    if (lstatSync(path).isSymbolicLink()) throw new Error(`Cache root cannot be a junction: ${name}`);
    return realpathSync(path);
  });
  const contained = (target) => roots.some((base) => {
    const name = relative(base, target);
    return !isAbsolute(name) && name !== ".." && !name.startsWith(`..${sep}`);
  });
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        if (!contained(realpathSync(path))) throw new Error(`Dependency cache link escapes into source/data: ${path}`);
      } else if (entry.isDirectory()) walk(path);
    }
  }
  for (const path of roots) walk(path);
}

if (import.meta.main) {
  assertNativeDependencyCache(resolve(import.meta.dirname, "../.."));
  console.log("Native dependency cache contains no external workspace/profile links");
}
