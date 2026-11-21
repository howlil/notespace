import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { readLocalStorage, writeLocalStorage } from "../../browser/local-storage";
import {
  DEFAULT_THEME_MODE,
  DEFAULT_THEME_PALETTE,
  PALETTE_STORAGE_KEY,
  THEME_STORAGE_KEY,
  parseThemeMode,
  parseThemePalette,
  resolveTheme,
  type ResolvedTheme,
  type ThemeMode,
  type ThemePalette,
} from "./theme-model";

export type ThemeContextValue = {
  mode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  dark: boolean;
  palette: ThemePalette;
  setMode: (mode: ThemeMode) => void;
  setPalette: (palette: ThemePalette) => void;
  toggle: () => void;
};

const Theme = createContext<ThemeContextValue>({
  mode: DEFAULT_THEME_MODE,
  resolvedTheme: "light",
  dark: false,
  palette: DEFAULT_THEME_PALETTE,
  setMode: () => {},
  setPalette: () => {},
  toggle: () => {},
});

function readSystemDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(DEFAULT_THEME_MODE);
  const [palette, setPaletteState] = useState<ThemePalette>(DEFAULT_THEME_PALETTE);
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    setModeState(parseThemeMode(readLocalStorage(THEME_STORAGE_KEY)));
    setPaletteState(parseThemePalette(readLocalStorage(PALETTE_STORAGE_KEY)));
    setSystemDark(readSystemDark());

    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onMediaChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) setModeState(parseThemeMode(event.newValue));
      if (event.key === PALETTE_STORAGE_KEY) setPaletteState(parseThemePalette(event.newValue));
    };

    media.addEventListener("change", onMediaChange);
    window.addEventListener("storage", onStorage);
    return () => {
      media.removeEventListener("change", onMediaChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const resolvedTheme = resolveTheme(mode, systemDark);
  const dark = resolvedTheme === "dark";

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.dataset.palette = palette;
  }, [resolvedTheme, palette]);

  const setMode = useCallback((next: ThemeMode) => {
    writeLocalStorage(THEME_STORAGE_KEY, next);
    setModeState(next);
  }, []);

  const setPalette = useCallback((next: ThemePalette) => {
    writeLocalStorage(PALETTE_STORAGE_KEY, next);
    setPaletteState(next);
  }, []);

  const toggle = useCallback(() => {
    const next: ThemeMode = dark ? "light" : "dark";
    writeLocalStorage(THEME_STORAGE_KEY, next);
    setModeState(next);
  }, [dark]);

  const value = useMemo<ThemeContextValue>(() => ({
    mode,
    resolvedTheme,
    dark,
    palette,
    setMode,
    setPalette,
    toggle,
  }), [mode, resolvedTheme, dark, palette, setMode, setPalette, toggle]);

  return <Theme.Provider value={value}>{children}</Theme.Provider>;
}

export const useTheme = () => useContext(Theme);
