import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Moon, Sun } from "lucide-react";
import { IconButton } from "../components/ui";

const Theme = createContext<{ dark: boolean; toggle: () => void }>({
  dark: false,
  toggle: () => {},
});
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("notespace-theme");
    } catch {
      /* Browser storage may be disabled. */
    }
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
            try {
              localStorage.setItem(
                "notespace-theme",
                current ? "light" : "dark",
              );
            } catch {
              /* Theme still works for this session. */
            }
            return !current;
          }),
      }}
    >
      {children}
    </Theme.Provider>
  );
}
export const useTheme = () => useContext(Theme);
export function ThemeToggle() {
  const { dark, toggle } = useTheme();
  return (
    <IconButton
      aria-label={dark ? "Use light theme" : "Use dark theme"}
      title={dark ? "Use light theme" : "Use dark theme"}
      onClick={toggle}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </IconButton>
  );
}
