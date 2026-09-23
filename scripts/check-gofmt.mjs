import { spawnSync } from "node:child_process";

const result = spawnSync("gofmt", ["-l", "."], {
  cwd: process.cwd(),
  encoding: "utf8",
});

if (result.error) {
  console.error(`failed to run gofmt: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  process.exit(result.status ?? 1);
}

const files = result.stdout.trim();
if (files) {
  console.error(`gofmt required for:\n${files}`);
  process.exit(1);
}
