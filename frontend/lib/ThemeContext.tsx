import React, { createContext, useContext, ReactNode } from "react";
import { useDarkMode } from "./useDarkMode";
import { lightColors, darkColors, ThemeColors } from "./theme";

interface ThemeContextType {
  colors: ThemeColors;
  darkMode: boolean;
  setDarkMode: (enabled: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  colors: lightColors,
  darkMode: false,
  setDarkMode: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { darkMode, setDarkMode } = useDarkMode();
  const colors = darkMode ? darkColors : lightColors;

  return (
    <ThemeContext.Provider value={{ colors, darkMode, setDarkMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
