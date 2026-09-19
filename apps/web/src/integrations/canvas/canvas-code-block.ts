import { common, createLowlight } from "lowlight";

export const CODE_BLOCK_DATA_KEY = "notespaceCodeBlock";

export type CodeBlockTheme = "auto" | "light" | "dark";
export type CodeBlockHeightMode = "auto" | "manual";

export type CanvasCodeBlockData = {
  version: 1;
  code: string;
  language: string;
  languageLocked: boolean;
  theme: CodeBlockTheme;
  lineNumbers: boolean;
  heightMode: CodeBlockHeightMode;
};

export type HighlightToken = {
  text: string;
  classes: string[];
};

const lowlight = createLowlight(common);

export const codeLanguageOptions = [
  ["plaintext", "Plain text"],
  ["javascript", "JavaScript"],
  ["typescript", "TypeScript"],
  ["python", "Python"],
  ["go", "Go"],
  ["java", "Java"],
  ["rust", "Rust"],
  ["c", "C"],
  ["cpp", "C++"],
  ["csharp", "C#"],
  ["bash", "Shell"],
  ["json", "JSON"],
  ["sql", "SQL"],
  ["xml", "HTML / XML"],
  ["css", "CSS"],
  ["yaml", "YAML"],
  ["markdown", "Markdown"],
] as const;

const detectableLanguages: string[] = codeLanguageOptions
  .map(([language]) => language)
  .filter((language) => language !== "plaintext" && lowlight.listLanguages().includes(language));

const languageAliases: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  golang: "go",
  shell: "bash",
  sh: "bash",
  html: "xml",
  yml: "yaml",
  md: "markdown",
};

export function normalizeCodeLanguage(language: string | null | undefined) {
  const normalized = language?.trim().toLowerCase() ?? "";
  if (!normalized) return "plaintext";
  return languageAliases[normalized] ?? normalized;
}

export function detectCodeLanguage(code: string) {
  if (!code.trim()) return "plaintext";
  try {
    const result = lowlight.highlightAuto(code, { subset: detectableLanguages });
    const data = result.data as { language?: unknown } | undefined;
    const detected = typeof data?.language === "string" ? normalizeCodeLanguage(data.language) : "plaintext";
    return detectableLanguages.includes(detected) ? detected : "plaintext";
  } catch {
    return "plaintext";
  }
}

export function defaultCanvasCodeBlock(): CanvasCodeBlockData {
  const code = "const x = 1;";
  return {
    version: 1,
    code,
    language: detectCodeLanguage(code),
    languageLocked: false,
    theme: "auto",
    lineNumbers: true,
    heightMode: "auto",
  };
}

function normalizeCodeBlockData(value: unknown): CanvasCodeBlockData | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Partial<CanvasCodeBlockData>;
  if (
    data.version !== 1
    || typeof data.code !== "string"
    || typeof data.language !== "string"
    || typeof data.languageLocked !== "boolean"
    || (data.theme !== "auto" && data.theme !== "light" && data.theme !== "dark")
    || typeof data.lineNumbers !== "boolean"
  ) {
    return null;
  }
  return {
    version: 1,
    code: data.code,
    language: data.language,
    languageLocked: data.languageLocked,
    theme: data.theme,
    lineNumbers: data.lineNumbers,
    heightMode: data.heightMode === "manual" ? "manual" : "auto",
  };
}

export function readCanvasCodeBlock(element: { customData?: Record<string, unknown> } | null | undefined) {
  return normalizeCodeBlockData(element?.customData?.[CODE_BLOCK_DATA_KEY]);
}

export function withCanvasCodeBlock(
  customData: Record<string, unknown> | undefined,
  block: CanvasCodeBlockData,
) {
  return {
    ...(customData ?? {}),
    [CODE_BLOCK_DATA_KEY]: block,
  };
}

function classNames(value: unknown) {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string") return value.split(/\s+/).filter(Boolean);
  return [];
}

type HastLike = {
  type?: unknown;
  value?: unknown;
  properties?: { className?: unknown };
  children?: HastLike[];
};

function flattenHighlight(nodes: readonly HastLike[], inherited: readonly string[] = []): HighlightToken[] {
  const tokens: HighlightToken[] = [];
  for (const node of nodes) {
    if (node.type === "text" && typeof node.value === "string") {
      tokens.push({ text: node.value, classes: [...inherited] });
      continue;
    }
    if (node.type === "element" && Array.isArray(node.children)) {
      tokens.push(...flattenHighlight(node.children, [...inherited, ...classNames(node.properties?.className)]));
    }
  }
  return tokens;
}

export function highlightCode(code: string, language: string) {
  const normalized = normalizeCodeLanguage(language);
  if (normalized === "plaintext" || !lowlight.listLanguages().includes(normalized)) {
    return [{ text: code, classes: [] }] satisfies HighlightToken[];
  }
  try {
    const root = lowlight.highlight(normalized, code) as unknown as { children?: HastLike[] };
    return flattenHighlight(root.children ?? []);
  } catch {
    return [{ text: code, classes: [] }] satisfies HighlightToken[];
  }
}

export function highlightCodeLines(code: string, language: string) {
  const lines: HighlightToken[][] = [[]];
  for (const token of highlightCode(code, language)) {
    const parts = token.text.split("\n");
    parts.forEach((part, index) => {
      if (part) lines[lines.length - 1].push({ text: part, classes: token.classes });
      if (index < parts.length - 1) lines.push([]);
    });
  }
  return lines;
}

export function resolveCodeTheme(theme: CodeBlockTheme, appDark: boolean): "light" | "dark" {
  if (theme === "auto") return appDark ? "dark" : "light";
  return theme;
}

export function codeTokenColor(classes: readonly string[], theme: "light" | "dark") {
  const has = (...names: string[]) => names.some((name) => classes.includes(name));
  if (theme === "dark") {
    if (has("hljs-comment", "hljs-quote")) return "#808080";
    if (has("hljs-keyword", "hljs-selector-tag", "hljs-literal")) return "#cc7832";
    if (has("hljs-string", "hljs-regexp", "hljs-addition")) return "#6a8759";
    if (has("hljs-number", "hljs-symbol", "hljs-bullet")) return "#6897bb";
    if (has("hljs-title", "hljs-section", "hljs-function")) return "#ffc66d";
    if (has("hljs-type", "hljs-built_in", "hljs-class")) return "#a9b7c6";
    if (has("hljs-attr", "hljs-attribute", "hljs-property")) return "#bababa";
    if (has("hljs-variable", "hljs-template-variable")) return "#9876aa";
    if (has("hljs-deletion")) return "#bc3f3c";
    return "#a9b7c6";
  }
  if (has("hljs-comment", "hljs-quote")) return "#808080";
  if (has("hljs-keyword", "hljs-selector-tag", "hljs-literal")) return "#000080";
  if (has("hljs-string", "hljs-regexp", "hljs-addition")) return "#008000";
  if (has("hljs-number", "hljs-symbol", "hljs-bullet")) return "#0000ff";
  if (has("hljs-title", "hljs-section", "hljs-function")) return "#660e7a";
  if (has("hljs-type", "hljs-built_in", "hljs-class")) return "#000000";
  if (has("hljs-attr", "hljs-attribute", "hljs-property")) return "#0000ff";
  if (has("hljs-variable", "hljs-template-variable")) return "#660e7a";
  if (has("hljs-deletion")) return "#a31515";
  return "#080808";
}

export function codeThemeSurface(theme: "light" | "dark") {
  return theme === "dark"
    ? { background: "#2b2b2b", foreground: "#a9b7c6", muted: "#808080", border: "#4e5257", toolbar: "#313335" }
    : { background: "#ffffff", foreground: "#080808", muted: "#7f7f7f", border: "#c9ccd1", toolbar: "#f5f5f5" };
}
