export type CodeBlockTheme = "auto" | "light" | "dark";
export type ResolvedCodeTheme = "light" | "dark";

type ThemeSurface = {
  background: string;
  foreground: string;
  muted: string;
  border: string;
  toolbar: string;
  error: string;
};

const surfaces: Record<ResolvedCodeTheme, ThemeSurface> = {
  dark: {
    background: "#2b2b2b",
    foreground: "#a9b7c6",
    muted: "#808080",
    border: "#4e5257",
    toolbar: "#313335",
    error: "#ff6b68",
  },
  light: {
    background: "#ffffff",
    foreground: "#080808",
    muted: "#7f7f7f",
    border: "#c9ccd1",
    toolbar: "#f5f5f5",
    error: "#b91c1c",
  },
};

export function resolveCodeTheme(theme: CodeBlockTheme, appDark: boolean): ResolvedCodeTheme {
  if (theme === "auto") return appDark ? "dark" : "light";
  return theme;
}

export function nextCodeTheme(theme: CodeBlockTheme): CodeBlockTheme {
  if (theme === "auto") return "dark";
  if (theme === "dark") return "light";
  return "auto";
}

export function codeThemeTitle(theme: CodeBlockTheme, appDark: boolean) {
  if (theme === "auto") {
    return `Theme: Auto · ${appDark ? "JetBrains Darcula" : "IntelliJ Light"}`;
  }
  return theme === "dark" ? "Theme: JetBrains Darcula" : "Theme: IntelliJ Light";
}

export function codeThemeSurface(theme: ResolvedCodeTheme): ThemeSurface {
  return surfaces[theme];
}

function tokenRole(classes: readonly string[]) {
  const has = (...names: string[]) => names.some((name) => classes.includes(name));
  if (has("hljs-comment", "hljs-quote")) return "comment";
  if (has("hljs-keyword", "hljs-selector-tag", "hljs-literal")) return "keyword";
  if (has("hljs-string", "hljs-regexp", "hljs-addition")) return "string";
  if (has("hljs-number", "hljs-symbol", "hljs-bullet")) return "number";
  if (has("hljs-title", "hljs-section", "hljs-function")) return "function";
  if (has("hljs-type", "hljs-built_in", "hljs-class")) return "type";
  if (has("hljs-attr", "hljs-attribute", "hljs-property")) return "property";
  if (has("hljs-variable", "hljs-template-variable")) return "variable";
  if (has("hljs-deletion")) return "deletion";
  return "foreground";
}

const tokenPalettes = {
  dark: {
    foreground: "#a9b7c6",
    comment: "#808080",
    keyword: "#cc7832",
    string: "#6a8759",
    number: "#6897bb",
    function: "#ffc66d",
    type: "#a9b7c6",
    property: "#bababa",
    variable: "#9876aa",
    deletion: "#bc3f3c",
  },
  light: {
    foreground: "#080808",
    comment: "#808080",
    keyword: "#000080",
    string: "#008000",
    number: "#0000ff",
    function: "#660e7a",
    type: "#000000",
    property: "#0000ff",
    variable: "#660e7a",
    deletion: "#a31515",
  },
} as const;

export function codeTokenColor(classes: readonly string[], theme: ResolvedCodeTheme) {
  return tokenPalettes[theme][tokenRole(classes)];
}

export function codeThemeVariables(theme: ResolvedCodeTheme): Record<string, string> {
  const surface = surfaces[theme];
  const tokens = tokenPalettes[theme];
  return {
    "--code-bg": surface.background,
    "--code-fg": surface.foreground,
    "--code-muted": surface.muted,
    "--code-border": surface.border,
    "--code-toolbar": surface.toolbar,
    "--code-error": surface.error,
    "--code-comment": tokens.comment,
    "--code-keyword": tokens.keyword,
    "--code-string": tokens.string,
    "--code-number": tokens.number,
    "--code-function": tokens.function,
    "--code-type": tokens.type,
    "--code-property": tokens.property,
    "--code-variable": tokens.variable,
    "--code-deletion": tokens.deletion,
  };
}
