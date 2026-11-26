import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  buildNativeReport,
  classifyNativeFailure,
  formatNativeSummaryMarkdown,
  parseNativeSmokeCases,
  sanitizeDiagnosticText,
  writeNativeReport,
} from "./native-smoke-report.mjs";

test("parseNativeSmokeCases defaults and validates explicit case subsets", () => {
  assert.deepEqual(parseNativeSmokeCases([], { critical: true }), [
    "native-runtime-chrome",
    "native-persistence",
    "native-html-sandbox",
  ]);
  assert.deepEqual(parseNativeSmokeCases(["--cases=native-persistence,native-html-sandbox"], { critical: true }), [
    "native-persistence",
    "native-html-sandbox",
  ]);
  assert.throws(() => parseNativeSmokeCases(["--cases=unknown"], { critical: true }));
  assert.throws(() => parseNativeSmokeCases(["--cases"], { critical: true }));
});

test("classifyNativeFailure distinguishes infra, automation, and product faults", () => {
  assert.equal(classifyNativeFailure(new Error("DevToolsActivePort file doesn't exist")), "infra");
  assert.equal(classifyNativeFailure(new Error("tauri-driver exited with code 1")), "infra");
  assert.equal(
    classifyNativeFailure(new Error('Timed out waiting for visible element: By(css selector, [aria-label="Search code languages"])')),
    "automation",
  );
  assert.equal(classifyNativeFailure(new Error("canvas elements must survive desktop relaunch")), "product");
  assert.equal(classifyNativeFailure(new Error("Desktop sidecar still serves requests after close")), "product");
});

test("sanitizeDiagnosticText redacts tokens/cookies and truncates cleanly", () => {
  const sanitized = sanitizeDiagnosticText("failed with cookie: abc123secret notespace_session=xyz999 and bearer=topsecret\nnext");
  assert.doesNotMatch(sanitized, /abc123secret|xyz999|topsecret/);
  assert.match(sanitized, /\[REDACTED\]/);
  assert.ok(sanitizeDiagnosticText("x".repeat(600), 100).length <= 100);
});

test("buildNativeReport and writeNativeReport preserve first failure and isolate independent case status", () => {
  const report = buildNativeReport({
    mode: "critical",
    binaryKind: "debug",
    runtime: { platform: "win32" },
    cases: [
      { name: "native-runtime-chrome", property: "Runtime & caption chrome", status: "pass", durationMs: 1200 },
      { name: "native-persistence", property: "Close flush & SQLite relaunch", status: "pass", durationMs: 8500 },
      {
        name: "native-html-sandbox",
        property: "Code Worker & WebView2 HTML isolation",
        status: "fail",
        category: "automation",
        durationMs: 3100,
        error: "Timed out waiting for visible element",
      },
    ],
  });
  assert.equal(report.total, 3);
  assert.equal(report.passed, 2);
  assert.equal(report.failed, 1);
  assert.equal(report.firstFailure.name, "native-html-sandbox");
  assert.equal(report.firstFailure.category, "automation");
  const md = formatNativeSummaryMarkdown(report);
  assert.match(md, /`native-persistence` \| Close flush & SQLite relaunch \| PASS/);
  assert.match(md, /First failure \(automation\)/);

  const dir = mkdtempSync(join(tmpdir(), "native-report-"));
  try {
    const out = join(dir, "nested", "native-report.json");
    writeNativeReport(out, report);
    assert.equal(JSON.parse(readFileSync(out, "utf8")).firstFailure.name, "native-html-sandbox");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
