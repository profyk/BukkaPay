import { useState, useEffect, useCallback } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export function useDarkMode() {
  const systemScheme = useColorScheme();
  const [darkMode, setDarkModeState] = useState(systemScheme === "dark");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem("dark_mode");
      if (stored !== null) {
        setDarkModeState(stored === "true");
      } else {
        setDarkModeState(systemScheme === "dark");
      }
      setLoaded(true);
    })();
  }, []);

  const setDarkMode = useCallback(async (enabled: boolean) => {
    setDarkModeState(enabled);
    await AsyncStorage.setItem("dark_mode", String(enabled));
  }, []);

  return { darkMode, setDarkMode, loaded };
}
