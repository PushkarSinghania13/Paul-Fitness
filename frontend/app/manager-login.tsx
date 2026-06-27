import React, { useState } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, radius, displayStyle } from "@/src/theme";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";

export default function ManagerLogin() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setSession } = useAuth();
  const [email, setEmail] = useState("manager@paulfitness.com");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    if (!email || !password) {
      setError("Email and password required");
      return;
    }
    setBusy(true);
    try {
      const r = await api<{ session_token: string }>("/auth/manager/login", {
        method: "POST",
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      await setSession(r.session_token);
      router.replace("/(manager)");
    } catch (e: any) {
      setError(e.message || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.surface }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
          <Pressable onPress={() => router.back()} hitSlop={12} testID="back-button">
            <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.headerTitle}>MANAGER ACCESS</Text>
          <View style={{ width: 26 }} />
        </View>

        <View style={styles.body}>
          <Text style={[displayStyle(40), { marginBottom: spacing.xs }]}>STAFF{"\n"}LOGIN</Text>
          <Text style={styles.subtitle}>Authorized personnel only.</Text>

          <View style={styles.inputBlock}>
            <Text style={styles.label}>EMAIL</Text>
            <TextInput
              testID="manager-email-input"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="manager@paulfitness.com"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
          </View>

          <View style={styles.inputBlock}>
            <Text style={styles.label}>PASSWORD</Text>
            <TextInput
              testID="manager-password-input"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
          </View>

          {error ? <Text style={styles.error} testID="manager-login-error">{error}</Text> : null}

          <Pressable
            testID="manager-login-submit"
            onPress={onSubmit}
            disabled={busy}
            style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
          >
            {busy ? <ActivityIndicator color={colors.onSurface} /> : <Text style={styles.primaryBtnText}>SIGN IN</Text>}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
    backgroundColor: colors.surface,
  },
  headerTitle: { color: colors.onSurface, fontSize: 13, fontWeight: "800", letterSpacing: 1.5 },
  body: { padding: spacing.xl, gap: spacing.lg },
  subtitle: { color: colors.onSurface3, marginBottom: spacing.lg, fontSize: 14 },
  inputBlock: {},
  label: { color: colors.onSurface3, fontSize: 11, letterSpacing: 1.5, marginBottom: 8, fontWeight: "700" },
  input: {
    backgroundColor: colors.surface2, color: colors.onSurface, paddingHorizontal: spacing.md,
    paddingVertical: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    fontSize: 15,
  },
  error: { color: colors.brand2, fontSize: 13 },
  primaryBtn: {
    backgroundColor: colors.brand, paddingVertical: 16, borderRadius: radius.md,
    alignItems: "center", justifyContent: "center", minHeight: 52,
  },
  primaryBtnText: { color: colors.onSurface, fontWeight: "800", letterSpacing: 1.5, fontSize: 14 },
});
