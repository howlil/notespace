import { codeLowlight, detectCodeLanguage, normalizeCodeLanguage } from "../../domain/code/code-language.ts";
import { codeThemeSurface, codeTokenColor, resolveCodeTheme, type CodeBlockTheme } from "../../domain/code/code-theme.ts";

export { codeLanguageOptions, detectCodeLanguage, normalizeCodeLanguage } from "../../domain/code/code-language.ts";
export { codeThemeSurface, codeThemeTitle, codeThemeVariables, codeTokenColor, nextCodeTheme, resolveCodeTheme } from "../../domain/code/code-theme.ts";
export type { CodeBlockTheme, ResolvedCodeTheme } from "../../domain/code/code-theme.ts";

export const CODE_BLOCK_DATA_KEY = "notespaceCodeBlock";

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
  if (normalized === "plaintext" || !codeLowlight.listLanguages().includes(normalized)) {
    return [{ text: code, classes: [] }] satisfies HighlightToken[];
  }
  try {
    const root = codeLowlight.highlight(normalized, code) as unknown as { children?: HastLike[] };
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
