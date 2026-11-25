import React, { createContext, useContext, ReactNode } from "react";
import { StatusBar } from "react-native";
import { useDarkMode } from "./useDarkMode";
import { lightColors, darkColors, ThemeColors } from "./theme";

interface ThemeContextType {
  colors: ThemeColors;
  darkMode: boolean;
  setDarkMode: (enabled: boolean) => void;
  followSystem: () => void;
  followsSystem: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  colors: lightColors,
  darkMode: false,
  setDarkMode: () => {},
  followSystem: () => {},
  followsSystem: true,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { darkMode, setDarkMode, followSystem, followsSystem } = useDarkMode();
  const colors = darkMode ? darkColors : lightColors;

  return (
    <ThemeContext.Provider value={{ colors, darkMode, setDarkMode, followSystem, followsSystem }}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.headerBg} />
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
