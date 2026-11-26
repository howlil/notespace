// Sanitized case-level diagnostics and failure classification for native WebView2 smoke runs.
// Never records auth tokens, session cookies, user DB rows, or authored note content.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const DEFAULT_CRITICAL_CASES = [
  "native-runtime-chrome",
  "native-persistence",
  "native-html-sandbox",
];

export const DEFAULT_SMOKE_CASES = [
  "native-runtime-chrome",
  "native-relaunch",
];

const SENSITIVE_PATTERNS = [
  /(?:bearer|token|cookie|session|secret|password|key)[=:]\s*[^\s,;]+/gi,
  /notespace_session=[^\s;]+/gi,
];

export function sanitizeDiagnosticText(value, maxLength = 500) {
  let text = String(value ?? "").replace(/\r?\n+/g, " ").trim();
  for (const pattern of SENSITIVE_PATTERNS) {
    text = text.replace(pattern, "[REDACTED]");
  }
  if (text.length > maxLength) {
    return `${text.slice(0, maxLength - 3)}...`;
  }
  return text;
}

export function classifyNativeFailure(error) {
  const message = String(error?.message ?? error ?? "");
  if (
    /DevToolsActivePort|tauri-driver exited|Timed out waiting for tauri-driver|unable to discover|ECONNREFUSED|session not created/i.test(
      message,
    )
  ) {
    return "infra";
  }
  if (
    /Timed out waiting for visible element|element click intercepted|stale element reference|no such element/i.test(
      message,
    )
  ) {
    return "automation";
  }
  return "product";
}

export function parseNativeSmokeCases(argv, { critical = false, upgradeSeed = false, upgradeVerify = false } = {}) {
  const defaults = upgradeSeed
    ? ["upgrade-seed"]
    : upgradeVerify
      ? ["upgrade-verify"]
      : critical
        ? DEFAULT_CRITICAL_CASES
        : DEFAULT_SMOKE_CASES;

  const flag = argv.find((arg) => arg === "--cases" || arg.startsWith("--cases="));
  if (!flag) return [...defaults];

  const raw = flag.includes("=") ? flag.slice("--cases=".length) : argv[argv.indexOf(flag) + 1];
  if (!raw || raw.startsWith("--")) {
    throw new Error("--cases requires a comma-separated list of native case names");
  }
  const requested = raw.split(",").map((item) => item.trim()).filter(Boolean);
  const allowed = new Set(defaults);
  if (!requested.length || requested.some((name) => !allowed.has(name))) {
    throw new Error(`Unknown native case in --cases=${raw}; allowed: ${defaults.join(", ")}`);
  }
  return [...new Set(requested)];
}

export function buildNativeReport({ mode, binaryKind, runtime = {}, cases }) {
  const failed = cases.filter((entry) => entry.status === "fail");
  return {
    mode,
    binaryKind,
    runtime,
    total: cases.length,
    passed: cases.filter((entry) => entry.status === "pass").length,
    failed: failed.length,
    firstFailure: failed[0] ? { name: failed[0].name, category: failed[0].category, error: failed[0].error } : null,
    cases,
  };
}

export function formatNativeSummaryMarkdown(report) {
  const lines = [
    `### Native Windows WebView2 Verification (${report.mode}, ${report.binaryKind})`,
    "",
    "| Case | Property | Status | Category | Duration |",
    "|---|---|---|---|---|",
  ];
  for (const entry of report.cases) {
    lines.push(
      `| \`${entry.name}\` | ${entry.property} | ${entry.status.toUpperCase()} | ${entry.category ?? "-"} | ${entry.durationMs}ms |`,
    );
  }
  if (report.firstFailure) {
    lines.push("", `**First failure (${report.firstFailure.category}):** \`${report.firstFailure.name}\` — ${report.firstFailure.error}`);
  }
  return `${lines.join("\n")}\n`;
}

export function writeNativeReport(filePath, report) {
  if (!filePath) return;
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(report, null, 2));
}
