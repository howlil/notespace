import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { readLocalStorage, writeLocalStorage } from "../../browser/local-storage";

const Theme = createContext<{ dark: boolean; toggle: () => void }>({
  dark: false,
  toggle: () => {},
});
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const saved = readLocalStorage("notespace-theme");
    setDark(
      saved
        ? saved === "dark"
        : matchMedia("(prefers-color-scheme: dark)").matches,
    );
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);
  return (
    <Theme.Provider
      value={{
        dark,
        toggle: () =>
          setDark((current) => {
            writeLocalStorage("notespace-theme", current ? "light" : "dark");
            return !current;
          }),
      }}
    >
      {children}
    </Theme.Provider>
  );
}
export const useTheme = () => useContext(Theme);
