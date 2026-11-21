export const THEME_STORAGE_KEY = "notespace-theme";
export const PALETTE_STORAGE_KEY = "notespace-palette";

export const THEME_MODES = ["system", "light", "dark"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];
export type ResolvedTheme = "light" | "dark";

export const THEME_PALETTE_IDS = ["paper", "stone", "sage", "amber", "graphite"] as const;
export type ThemePalette = (typeof THEME_PALETTE_IDS)[number];

export const DEFAULT_THEME_MODE: ThemeMode = "system";
export const DEFAULT_THEME_PALETTE: ThemePalette = "paper";

type ThemePreviewSwatches = {
  bg: string;
  canvas: string;
  surface: string;
  ink: string;
  accent: string;
};

export type ThemePaletteOption = {
  id: ThemePalette;
  label: string;
  description: string;
  preview: Record<ResolvedTheme, ThemePreviewSwatches>;
};

export const THEME_PALETTES: readonly ThemePaletteOption[] = [
  {
    id: "paper",
    label: "Paper",
    description: "Warm paper and ink indigo for long reading and writing",
    preview: {
      light: { bg: "#f3efe7", canvas: "#f7f4ed", surface: "#fffdf9", ink: "#23201b", accent: "#3252b6" },
      dark: { bg: "#141311", canvas: "#171513", surface: "#24211d", ink: "#ebe6dd", accent: "#8caaf9" },
    },
  },
  {
    id: "stone",
    label: "Stone",
    description: "Crisp mineral neutrals with Notespace cobalt blue",
    preview: {
      light: { bg: "#f2f4f8", canvas: "#f6f8fb", surface: "#ffffff", ink: "#1b212c", accent: "#2858d8" },
      dark: { bg: "#111318", canvas: "#14171e", surface: "#1f242f", ink: "#e8ecf4", accent: "#91b1ff" },
    },
  },
  {
    id: "sage",
    label: "Sage",
    description: "Soft linen surfaces and deep botanical pine accents",
    preview: {
      light: { bg: "#f2f4ef", canvas: "#f6f7f3", surface: "#fdfefb", ink: "#1e2520", accent: "#226a56" },
      dark: { bg: "#111513", canvas: "#141916", surface: "#1f2723", ink: "#e5ebe7", accent: "#72c4a8" },
    },
  },
  {
    id: "amber",
    label: "Amber",
    description: "Warm editorial paper paired with burnt terracotta",
    preview: {
      light: { bg: "#f4efe9", canvas: "#f8f4ee", surface: "#fffdfa", ink: "#241f1a", accent: "#a9431a" },
      dark: { bg: "#151210", canvas: "#181412", surface: "#25201c", ink: "#efe8df", accent: "#ec9066" },
    },
  },
  {
    id: "graphite",
    label: "Graphite",
    description: "Pure distraction-free monochrome neutrals",
    preview: {
      light: { bg: "#f3f3f4", canvas: "#f7f7f8", surface: "#ffffff", ink: "#1c1c1e", accent: "#46495c" },
      dark: { bg: "#121213", canvas: "#151516", surface: "#202022", ink: "#eaeaea", accent: "#b4b8cc" },
    },
  },
];

export function parseThemeMode(value: string | null | undefined): ThemeMode {
  if (value === "system" || value === "light" || value === "dark") return value;
  return DEFAULT_THEME_MODE;
}

export function parseThemePalette(value: string | null | undefined): ThemePalette {
  if (value && (THEME_PALETTE_IDS as readonly string[]).includes(value)) {
    return value as ThemePalette;
  }
  return DEFAULT_THEME_PALETTE;
}

export function resolveTheme(mode: ThemeMode, systemDark: boolean): ResolvedTheme {
  if (mode === "light" || mode === "dark") return mode;
  return systemDark ? "dark" : "light";
}

export function paletteCanvasColor(palette: ThemePalette, dark: boolean): string {
  const entry = THEME_PALETTES.find((item) => item.id === palette) ?? THEME_PALETTES[0];
  return dark ? entry.preview.dark.canvas : entry.preview.light.canvas;
}

export function themeModeLabel(mode: ThemeMode, resolvedTheme: ResolvedTheme): string {
  if (mode === "system") {
    return `System (${resolvedTheme === "dark" ? "Dark" : "Light"})`;
  }
  return mode === "dark" ? "Dark" : "Light";
}

export const THEME_INIT_SCRIPT = `(function(){try{var d=document.documentElement,m=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)}),p=localStorage.getItem(${JSON.stringify(PALETTE_STORAGE_KEY)}),validM=m==="light"||m==="dark"||m==="system"?m:"system",validP=${JSON.stringify(THEME_PALETTE_IDS)}.indexOf(p)!==-1?p:${JSON.stringify(DEFAULT_THEME_PALETTE)},sys=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches;d.dataset.theme=validM==="system"?(sys?"dark":"light"):validM;d.dataset.palette=validP;}catch(e){}})();`;
