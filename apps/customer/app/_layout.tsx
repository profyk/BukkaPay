import { Stack } from "expo-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "../lib/queryClient";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "../lib/ThemeContext";
import { CurrencyProvider } from "../lib/CurrencyContext";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { installIdempotency } from "../lib/idempotency";

// Every payment request carries an Idempotency-Key (see lib/idempotency).
installIdempotency();

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <CurrencyProvider>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="(auth)" />
                <Stack.Screen name="(screens)" />
                <Stack.Screen name="pay" />
                <Stack.Screen name="pay-rent" />
                <Stack.Screen name="claim" />
                <Stack.Screen name="+not-found" />
              </Stack>
            </CurrencyProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
