import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { readLocalStorage, writeLocalStorage } from "../../browser/local-storage";
import {
  DEFAULT_THEME_MODE,
  DEFAULT_THEME_PALETTE,
  PALETTE_STORAGE_KEY,
  parseThemePalette,
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

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [palette, setPaletteState] = useState<ThemePalette>(DEFAULT_THEME_PALETTE);

  useEffect(() => {
    setPaletteState(parseThemePalette(readLocalStorage(PALETTE_STORAGE_KEY)));

    if (typeof window === "undefined") return;
    const onStorage = (event: StorageEvent) => {
      if (event.key === PALETTE_STORAGE_KEY) setPaletteState(parseThemePalette(event.newValue));
    };

    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = "light";
    document.documentElement.dataset.palette = palette;
  }, [palette]);

  const setMode = useCallback(() => {}, []);

  const setPalette = useCallback((next: ThemePalette) => {
    writeLocalStorage(PALETTE_STORAGE_KEY, next);
    setPaletteState(next);
  }, []);

  const toggle = useCallback(() => {}, []);

  const value = useMemo<ThemeContextValue>(() => ({
    mode: DEFAULT_THEME_MODE,
    resolvedTheme: "light",
    dark: false,
    palette,
    setMode,
    setPalette,
    toggle,
  }), [palette, setMode, setPalette, toggle]);

  return <Theme.Provider value={value}>{children}</Theme.Provider>;
}

export const useTheme = () => useContext(Theme);
