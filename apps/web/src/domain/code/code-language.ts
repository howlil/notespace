import { common, createLowlight } from "lowlight";

export const codeLowlight = createLowlight(common);

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
  .filter((language) => language !== "plaintext" && codeLowlight.listLanguages().includes(language));

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
    const result = codeLowlight.highlightAuto(code, { subset: detectableLanguages });
    const data = result.data as { language?: unknown } | undefined;
    const detected = typeof data?.language === "string"
      ? normalizeCodeLanguage(data.language)
      : "plaintext";
    return detectableLanguages.includes(detected) ? detected : "plaintext";
  } catch {
    return "plaintext";
  }
}

export function codeLanguageLabel(language: string) {
  const normalized = normalizeCodeLanguage(language);
  return codeLanguageOptions.find(([value]) => value === normalized)?.[1] ?? normalized;
}
