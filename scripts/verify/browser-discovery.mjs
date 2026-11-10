import { readFileSync, readdirSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { affectedBrowserSuites, classifyBrowserProof } from "./browser-proof-policy.mjs";

export function discoverBrowserSuites(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return discoverBrowserSuites(path);
    return entry.isFile() && entry.name.endsWith(".e2e.mjs") ? [path] : [];
  }).sort();
}

const slash = (path) => path.split(sep).join("/");

function explicitSuite(root, file) {
  const target = realpathSync(resolve(root, file));
  const directory = realpathSync(join(root, "tests", "e2e"));
  const name = relative(directory, target);
  if (isAbsolute(name) || name === ".." || name.startsWith(`..${sep}`) || !name.endsWith(".e2e.mjs")) {
    throw new Error("--file must name an existing .e2e.mjs suite inside tests/e2e");
  }
  return target;
}

function suiteProofs(root, file) {
  const source = readFileSync(file, "utf8");
  const key = slash(relative(join(root, "tests", "e2e"), file));
  const literals = [...source.matchAll(/^\s*test\(\s*("(?:[^"\\]|\\.)*")\s*,/gm)];
  const registrations = source.match(/\btest\s*\(/g) ?? [];
  if (!registrations.length) throw new Error(`No browser cases registered in ${key}`);
  // Unsupported/dynamic/single-quoted registration must never silently vanish.
  if (literals.length !== registrations.length) return [{ file, name: null, risk: "unknown", property: "Unparsed registration requires full proof", smoke: true }];
  return literals.map(([, literal]) => {
    const name = JSON.parse(literal);
    return { file, name, ...classifyBrowserProof(key, name) };
  });
}

export function browserProofInventory(root, files = discoverBrowserSuites(join(root, "tests", "e2e"))) {
  return files.flatMap((file) => suiteProofs(root, file));
}

function changedPaths(values) {
  if (!Array.isArray(values) || !values.length) throw new Error("Affected proof requires a nonempty changed-files JSON array");
  return values.map((value) => {
    if (typeof value !== "string" || !value.trim() || value.includes("\0")) throw new Error("Invalid changed file path");
    const path = value.replaceAll("\\", "/").replace(/^\.\//, "");
    if (path.startsWith("/") || /^[a-z]:/i.test(path) || path.split("/").includes("..")) throw new Error("Changed paths must be repository-relative");
    return path;
  });
}

function affectedFiles(root, files, paths) {
  const names = files.map((file) => slash(relative(join(root, "tests", "e2e"), file)));
  const selected = paths.map((path) => affectedBrowserSuites(path, names));
  if (selected.some((result) => result === null)) return null;
  const selectedNames = new Set(selected.flat());
  return new Set(files.filter((file, index) => selectedNames.has(names[index])));
}

function casePattern(proofs) {
  const names = [...new Set(proofs.map(({ name }) => name))];
  const escaped = names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return `^(?:${escaped.join("|")})$`;
}

function validateRunOptions(options) {
  const file = options.file ?? null, mode = options.mode ?? "full", changedFiles = options.changedFiles ?? null;
  if (!["full", "critical", "master", "smoke", "affected"].includes(mode)) throw new Error(`Unknown browser proof mode: ${mode}`);
  if (file && !["full", "critical"].includes(mode)) throw new Error("--file cannot be combined with this selection mode");
  if (mode !== "affected" && changedFiles !== null) throw new Error("Changed files apply only to affected proof");
  return { file, mode, changedFiles };
}

export function selectBrowserRun(root, options = {}) {
  const { file, mode, changedFiles } = validateRunOptions(options);
  const paths = mode === "affected" ? changedPaths(changedFiles) : null;
  const files = file !== null ? [explicitSuite(root, file)] : discoverBrowserSuites(join(root, "tests", "e2e"));
  if (!files.length) throw new Error("No browser journeys were discovered");
  const proofs = browserProofInventory(root, files);
  const full = { files, proofs, pattern: null, reason: "full" };
  if (mode === "full") return full;
  if (proofs.some(({ risk }) => risk === "unknown")) return { ...full, reason: "unclassified proof: conservative full run" };
  const riskSelection = selectRiskProof(proofs, mode);
  if (riskSelection) return riskSelection;
  const affected = affectedFiles(root, files, paths);
  if (affected === null) return { ...full, reason: "shared/unknown path: conservative full run" };
  return selectedRun(proofs.filter(({ smoke, file: path }) => smoke || affected.has(path)), "affected + risk smoke");
}

function selectRiskProof(proofs, mode) {
  if (mode === "critical") return selectedRun(proofs.filter(({ name }) => name.startsWith("critical:")), "legacy critical");
  if (mode === "master") return selectedRun(proofs.filter(({ name, smoke }) => smoke || name.startsWith("critical:")), "master critical + risk smoke");
  if (mode === "smoke") return selectedRun(proofs.filter(({ smoke }) => smoke), "risk smoke");
  return null;
}

function selectedRun(proofs, reason) {
  if (!proofs.length) throw new Error("No browser cases match this selection");
  return { files: [...new Set(proofs.map(({ file }) => file))], proofs, pattern: casePattern(proofs), reason };
}

// Preserve the existing file-discovery API as callers adopt risk-aware plans.
export function selectBrowserSuites(root, { file = null, critical = false, ...options } = {}) {
  return selectBrowserRun(root, { file, mode: critical ? "critical" : "full", ...options }).files;
}
