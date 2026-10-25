// Temporary formatting probe. Restore the baseline script immediately after collecting output.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const path = "internal/sqlite/workspace_recovery_pagination_proofs_test.go";
execFileSync("gofmt", ["-w", path]);
console.log("FORMATTED_TEST_PROOF=" + readFileSync(path).toString("base64"));
process.exit(1);
