import React from "react";
import { View, Text, TouchableOpacity, useColorScheme } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { lightColors, darkColors } from "../lib/theme";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught error:", error, info.componentStack);
  }

  handleTryAgain = () => {
    this.setState({ hasError: false });
  };

  handleGoHome = () => {
    this.setState({ hasError: false });
    router.replace("/");
  };

  render() {
    if (this.state.hasError) {
      return <ErrorScreen onTryAgain={this.handleTryAgain} onGoHome={this.handleGoHome} />;
    }
    return this.props.children;
  }
}

function ErrorScreen({
  onTryAgain,
  onGoHome,
}: {
  onTryAgain: () => void;
  onGoHome: () => void;
}) {
  // This boundary wraps ThemeProvider itself (see app/_layout.tsx), so an
  // error inside that subtree can take the provider down with it —
  // useTheme() isn't safe to call here. Fall back to the OS-level scheme
  // (always available) against the same palettes ThemeProvider uses.
  const scheme = useColorScheme();
  const c = scheme === "dark" ? darkColors : lightColors;
  const primary = c.primary;
  const primaryLight = c.primaryLight;
  const background = c.background;
  const text = c.text;
  const textSecondary = c.textSecondary;

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 24,
        backgroundColor: background,
      }}
    >
      <View
        style={{
          width: 120,
          height: 120,
          borderRadius: 60,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 24,
          backgroundColor: primaryLight,
        }}
      >
        <Ionicons name="warning-outline" size={64} color={primary} />
      </View>

      <Text
        style={{
          fontSize: 22,
          fontWeight: "700",
          marginBottom: 12,
          textAlign: "center",
          color: text,
        }}
      >
        Something Went Wrong
      </Text>

      <Text
        style={{
          fontSize: 15,
          textAlign: "center",
          marginBottom: 36,
          color: textSecondary,
        }}
      >
        An unexpected error occurred. You can try again or return to the home screen.
      </Text>

      <TouchableOpacity
        onPress={onTryAgain}
        activeOpacity={0.7}
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 14,
          paddingHorizontal: 28,
          borderRadius: 12,
          backgroundColor: primary,
          marginBottom: 12,
          width: "100%",
          justifyContent: "center",
        }}
      >
        <Ionicons name="refresh-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
        <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "600" }}>Try Again</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={onGoHome}
        activeOpacity={0.7}
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 14,
          paddingHorizontal: 28,
          borderRadius: 12,
          backgroundColor: primaryLight,
          width: "100%",
          justifyContent: "center",
        }}
      >
        <Ionicons name="home-outline" size={18} color={primary} style={{ marginRight: 8 }} />
        <Text style={{ color: primary, fontSize: 16, fontWeight: "600" }}>Go Home</Text>
      </TouchableOpacity>
    </View>
  );
}
