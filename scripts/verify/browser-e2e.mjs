/* One WebdriverIO/Node runner; each suite owns isolated Go/SQLite/Chrome fixtures.
 * --mode smoke | affected | master | full; --changed-files paths.json for affected.
 * --critical retains the legacy critical set; --file runs one complete suite.
 * --list validates and prints the plan without starting any browser/server.
 */
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { selectBrowserRun } from "./browser-discovery.mjs";

const root = resolve(import.meta.dirname, "../..");
const valueFlags = new Set(["--mode", "--file", "--changed-files", "--concurrency", "--test-timeout"]);
const booleanFlags = new Set(["--critical", "--list"]);

function flagValue(name, inline, next) {
  if (inline !== undefined) return { value: inline, consumed: false };
  if (!next || next.startsWith("--")) throw new Error(`Missing value for ${name}`);
  return { value: next, consumed: true };
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index++) {
    const [name, ...parts] = args[index].split("=");
    if (!valueFlags.has(name) && !booleanFlags.has(name)) throw new Error(`Unknown browser option: ${name}`);
    if (Object.hasOwn(options, name)) throw new Error(`Duplicate browser option: ${name}`);
    if (booleanFlags.has(name)) {
      if (parts.length) throw new Error(`${name} does not take a value`);
      options[name] = true;
      continue;
    }
    const { value, consumed } = flagValue(name, parts.length ? parts.join("=") : undefined, args[index + 1]);
    options[name] = value;
    index += Number(consumed);
  }
  return options;
}

function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error(`${name} must be a positive integer`);
  return number;
}

const options = parseArgs(process.argv.slice(2));
if (options["--critical"] && options["--mode"]) throw new Error("Use either --critical or --mode, not both");
const mode = options["--mode"] ?? (options["--critical"] ? "critical" : "full");
const concurrency = positiveInteger(options["--concurrency"] ?? 4, "concurrency");
const timeout = positiveInteger(options["--test-timeout"] ?? 240_000, "test-timeout");
const changedFiles = Object.hasOwn(options, "--changed-files") ? JSON.parse(readFileSync(resolve(root, options["--changed-files"]), "utf8")) : null;
const plan = selectBrowserRun(root, { file: options["--file"], mode, changedFiles });

if (options["--list"]) {
  console.log(JSON.stringify({ ...plan, files: plan.files.map((file) => relative(root, file)) }, null, 2));
} else {
  const nodeArgs = ["--test", `--test-concurrency=${concurrency}`, `--test-timeout=${timeout}`];
  if (plan.pattern) nodeArgs.push(`--test-name-pattern=${plan.pattern}`);
  console.error(`Browser proof: ${plan.files.length} file(s), ${plan.proofs.length} case(s), ${plan.reason}, concurrency ${concurrency}`);
  for (const file of plan.files) console.error(`  ${relative(root, file)}`);
  const result = spawnSync(process.execPath, [...nodeArgs, ...plan.files], { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}
