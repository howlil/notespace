/* Browser proof runner: discovers the WebdriverIO/Node suites and runs them.
 *
 *   node scripts/verify/browser-e2e.mjs                 # every browser journey
 *   node scripts/verify/browser-e2e.mjs --critical      # only `critical:` journeys
 *   node scripts/verify/browser-e2e.mjs --file tests/e2e/library/search.e2e.mjs
 *
 * Each spec file owns its own Go/SQLite server, proxy and Chrome session, so
 * files are independent and run concurrently up to the configured limit.
 */
import { selectBrowserSuites } from "./browser-discovery.mjs";
import { relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "../..");
const args = process.argv.slice(2);

function flagValue(name, fallback) {
  const inline = args.find((argument) => argument.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const position = args.indexOf(`--${name}`);
  if (position >= 0 && args[position + 1] && !args[position + 1].startsWith("--")) return args[position + 1];
  return fallback;
}

const criticalOnly = args.includes("--critical");
const concurrency = flagValue("concurrency", "4");
const testTimeout = flagValue("test-timeout", "240000");
const explicitFile = flagValue("file", null);

const files = selectBrowserSuites(root, { file: explicitFile, critical: criticalOnly });

if (files.length === 0) {
  throw new Error("No browser journeys were discovered.");
}

const nodeArgs = [
  "--test",
  `--test-concurrency=${concurrency}`,
  `--test-timeout=${testTimeout}`,
];
if (criticalOnly) nodeArgs.push("--test-name-pattern=^critical:");

console.error(`Browser proof: ${files.length} file(s), concurrency ${concurrency}${criticalOnly ? ", critical only" : ""}`);
for (const file of files) console.error(`  ${relative(root, file)}`);

const result = spawnSync(process.execPath, [...nodeArgs, ...files], { cwd: root, stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
