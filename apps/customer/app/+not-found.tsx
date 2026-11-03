import { View, Text, TouchableOpacity } from "react-native";
import { Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../lib/ThemeContext";

export default function NotFound() {
  const { colors } = useTheme();

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 24,
        backgroundColor: colors.background,
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
          backgroundColor: colors.primaryLight,
        }}
      >
        <Ionicons name="compass-outline" size={64} color={colors.primary} />
      </View>

      <Text
        style={{
          fontSize: 56,
          fontWeight: "700",
          marginBottom: 8,
          color: colors.primary,
        }}
      >
        404
      </Text>

      <Text
        style={{
          fontSize: 22,
          fontWeight: "700",
          marginBottom: 12,
          textAlign: "center",
          color: colors.text,
        }}
      >
        Page Not Found
      </Text>

      <Text
        style={{
          fontSize: 15,
          textAlign: "center",
          marginBottom: 36,
          color: colors.textSecondary,
        }}
      >
        Looks like this page doesn't exist or has been moved.
      </Text>

      <Link href="/" asChild>
        <TouchableOpacity
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: 14,
            paddingHorizontal: 28,
            borderRadius: 12,
            backgroundColor: colors.primary,
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="home-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
          <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "600" }}>
            Back to Home
          </Text>
        </TouchableOpacity>
      </Link>
    </View>
  );
}
