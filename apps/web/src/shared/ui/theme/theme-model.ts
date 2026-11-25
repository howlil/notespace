export const THEME_STORAGE_KEY = "notespace-theme";
export const PALETTE_STORAGE_KEY = "notespace-palette";

export const THEME_MODES = ["light"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];
export type ResolvedTheme = "light";

export const THEME_PALETTE_IDS = ["graphite", "paper", "stone", "sage", "amber"] as const;
export type ThemePalette = (typeof THEME_PALETTE_IDS)[number];

export const DEFAULT_THEME_MODE: ThemeMode = "light";
export const DEFAULT_THEME_PALETTE: ThemePalette = "graphite";

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
    id: "graphite",
    label: "Graphite",
    description: "Pure distraction-free monochrome neutrals",
    preview: {
      light: { bg: "#f3f3f4", canvas: "#f7f7f8", surface: "#ffffff", ink: "#1c1c1e", accent: "#46495c" },
    },
  },
  {
    id: "paper",
    label: "Paper",
    description: "Soft warm alabaster with restrained slate-indigo",
    preview: {
      light: { bg: "#f4f2ee", canvas: "#f8f7f4", surface: "#fcfbf9", ink: "#22211e", accent: "#484f69" },
    },
  },
  {
    id: "stone",
    label: "Stone",
    description: "Cool mineral neutrals with calm slate-blue",
    preview: {
      light: { bg: "#f2f3f5", canvas: "#f7f8fa", surface: "#ffffff", ink: "#1c1f24", accent: "#3d5278" },
    },
  },
  {
    id: "sage",
    label: "Sage",
    description: "Subtle mineral linen with muted pine accents",
    preview: {
      light: { bg: "#f2f4f2", canvas: "#f7f8f7", surface: "#fcfdfc", ink: "#1d211e", accent: "#3d5c50" },
    },
  },
  {
    id: "amber",
    label: "Amber",
    description: "Warm sandstone neutrals with restrained clay",
    preview: {
      light: { bg: "#f4f2ef", canvas: "#f8f7f5", surface: "#fdfcfa", ink: "#211e1b", accent: "#7a4e3a" },
    },
  },
];

export function parseThemeMode(value?: string | null): ThemeMode {
  void value;
  return DEFAULT_THEME_MODE;
}

export function parseThemePalette(value: string | null | undefined): ThemePalette {
  if (value && (THEME_PALETTE_IDS as readonly string[]).includes(value)) {
    return value as ThemePalette;
  }
  return DEFAULT_THEME_PALETTE;
}

export function resolveTheme(mode: ThemeMode, systemDark = false): ResolvedTheme {
  void mode;
  void systemDark;
  return "light";
}

export function paletteCanvasColor(palette: ThemePalette, dark = false): string {
  void dark;
  const entry = THEME_PALETTES.find((item) => item.id === palette) ?? THEME_PALETTES[0];
  return entry.preview.light.canvas;
}

export function themeModeLabel(mode: ThemeMode, resolvedTheme: ResolvedTheme): string {
  void mode;
  void resolvedTheme;
  return "Light";
}

export const THEME_INIT_SCRIPT = `(function(){try{var d=document.documentElement,p=localStorage.getItem(${JSON.stringify(PALETTE_STORAGE_KEY)}),validP=${JSON.stringify(THEME_PALETTE_IDS)}.indexOf(p)!==-1?p:${JSON.stringify(DEFAULT_THEME_PALETTE)};d.dataset.theme="light";d.dataset.palette=validP;}catch(e){}})();`;
