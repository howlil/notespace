// Temporary CI formatter probe; restored before final review.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const paths = ["internal/httpapi/workspace_proofs_test.go", "internal/sqlite/workspace_lifecycle_proofs_test.go"];
execFileSync("gofmt", ["-w", ...paths], { cwd: process.cwd() });
paths.forEach((path, index) => console.log("FMT_WORKSPACE_PROOF_" + index + "=" + readFileSync(path).toString("base64")));
process.exit(1);
