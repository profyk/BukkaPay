import { useState, useEffect, useCallback } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

/** Dark mode: follows the phone's setting (live) until the customer picks
 *  light or dark; "match phone" clears the choice again. */
export function useDarkMode() {
  const systemScheme = useColorScheme();
  const [choice, setChoice] = useState<boolean | null>(null); // null = follow the phone
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem("dark_mode");
      setChoice(stored === null ? null : stored === "true");
      setLoaded(true);
    })();
  }, []);

  const setDarkMode = useCallback(async (enabled: boolean) => {
    setChoice(enabled);
    await AsyncStorage.setItem("dark_mode", String(enabled));
  }, []);

  const followSystem = useCallback(async () => {
    setChoice(null);
    await AsyncStorage.removeItem("dark_mode");
  }, []);

  const darkMode = choice === null ? systemScheme === "dark" : choice;
  return { darkMode, setDarkMode, followSystem, followsSystem: choice === null, loaded };
}
