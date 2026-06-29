import React, { useState } from "react";
import {
  View, Text, StyleSheet, Pressable, Linking, TextInput, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, radius, displayStyle } from "@/src/theme";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";

export default function ManagerProfile() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const router = useRouter();
  const [showPwd, setShowPwd] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const submit = async () => {
    setFeedback(null);
    if (!current || !next) {
      setFeedback({ kind: "err", msg: "Fill both current and new password." });
      return;
    }
    if (next.length < 8) {
      setFeedback({ kind: "err", msg: "New password must be at least 8 characters." });
      return;
    }
    if (next !== confirm) {
      setFeedback({ kind: "err", msg: "New password and confirmation don't match." });
      return;
    }
    setBusy(true);
    try {
      await api("/auth/manager/change-password", {
        method: "POST",
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      setFeedback({ kind: "ok", msg: "Password updated. Use the new password next time you sign in." });
      setCurrent(""); setNext(""); setConfirm("");
      setShowPwd(false);
    } catch (e: any) {
      setFeedback({ kind: "err", msg: e.message || "Update failed" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
        testID="manager-profile-screen"
      >
        <Text style={[displayStyle(28), { fontSize: 28, paddingHorizontal: spacing.lg, marginBottom: spacing.lg }]}>STAFF PROFILE</Text>

        <View style={styles.card}>
          <View style={styles.avatar}>
            <Ionicons name="shield-checkmark" size={28} color={colors.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{user?.name || "Manager"}</Text>
            <Text style={styles.email}>{user?.email}</Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>MANAGER</Text>
            </View>
          </View>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.label}>GYM</Text>
          <Text style={styles.gymName}>PAUL FITNESS GYM</Text>
          <Text style={styles.gymInfo}>GMXH+7H, Munshefdanga, Raghunathpur, West Bengal</Text>
          <Pressable
            testID="manager-call-gym"
            onPress={() => Linking.openURL("tel:07908283507")}
            style={styles.callBtn}
          >
            <Ionicons name="call" size={16} color={colors.onSurface} />
            <Text style={styles.callText}>079082 83507</Text>
          </Pressable>
        </View>

        {/* Manage Plans */}
        <Pressable
          onPress={() => router.push("/manage-plans")}
          style={({ pressed }) => [styles.pwdToggle, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="pricetag" size={18} color={colors.onSurface2} />
          <Text style={styles.pwdToggleText}>MANAGE PLANS</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.onSurface3} />
        </Pressable>

        {/* Change Password */}
        <Pressable
          testID="toggle-change-password"
          onPress={() => { setShowPwd(v => !v); setFeedback(null); }}
          style={({ pressed }) => [styles.pwdToggle, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="lock-closed" size={18} color={colors.onSurface2} />
          <Text style={styles.pwdToggleText}>CHANGE PASSWORD</Text>
          <Ionicons name={showPwd ? "chevron-up" : "chevron-down"} size={18} color={colors.onSurface3} />
        </Pressable>

        {showPwd ? (
          <View style={styles.pwdForm} testID="password-form">
            <Text style={styles.fieldLabel}>CURRENT PASSWORD</Text>
            <TextInput
              testID="current-password-input"
              value={current}
              onChangeText={setCurrent}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
            <Text style={styles.fieldLabel}>NEW PASSWORD</Text>
            <TextInput
              testID="new-password-input"
              value={next}
              onChangeText={setNext}
              secureTextEntry
              placeholder="At least 8 characters"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
            <Text style={styles.fieldLabel}>CONFIRM NEW PASSWORD</Text>
            <TextInput
              testID="confirm-password-input"
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              placeholder="Re-enter new password"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />

            {feedback ? (
              <Text style={[styles.feedback, { color: feedback.kind === "ok" ? colors.success : colors.brand2 }]} testID="password-feedback">
                {feedback.msg}
              </Text>
            ) : null}

            <Pressable
              testID="submit-change-password"
              onPress={submit}
              disabled={busy}
              style={({ pressed }) => [styles.submitBtn, pressed && { opacity: 0.85 }]}
            >
              {busy ? <ActivityIndicator color={colors.onSurface} /> : <Text style={styles.submitText}>UPDATE PASSWORD</Text>}
            </Pressable>
          </View>
        ) : null}

        <Pressable testID="manager-logout" onPress={logout} style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.85 }]}>
          <Ionicons name="log-out-outline" size={18} color={colors.brand2} />
          <Text style={styles.logoutText}>LOG OUT</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    marginHorizontal: spacing.lg, padding: spacing.lg,
    backgroundColor: colors.surface2, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  avatar: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brandTertiary,
    alignItems: "center", justifyContent: "center",
  },
  name: { color: colors.onSurface, fontSize: 16, fontWeight: "700" },
  email: { color: colors.onSurface3, fontSize: 13, marginTop: 2 },
  roleBadge: { alignSelf: "flex-start", marginTop: 6, backgroundColor: colors.brand, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  roleText: { color: colors.onSurface, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  infoCard: {
    marginHorizontal: spacing.lg, marginTop: spacing.lg, padding: spacing.lg,
    backgroundColor: colors.surface2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
  },
  label: { color: colors.onSurface3, fontSize: 11, letterSpacing: 2, fontWeight: "800" },
  gymName: { ...displayStyle(22), fontSize: 22, marginTop: 4 },
  gymInfo: { color: colors.onSurface2, fontSize: 13, marginTop: 8 },
  callBtn: {
    flexDirection: "row", gap: 8, alignSelf: "flex-start", alignItems: "center",
    backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.md, paddingVertical: 10,
    borderRadius: radius.md, marginTop: spacing.md,
  },
  callText: { color: colors.onSurface, fontWeight: "700", fontSize: 13 },
  pwdToggle: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    marginHorizontal: spacing.lg, marginTop: spacing.lg, paddingHorizontal: spacing.lg, paddingVertical: 14,
    backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  pwdToggleText: { flex: 1, color: colors.onSurface, fontWeight: "800", letterSpacing: 1.2, fontSize: 13 },
  pwdForm: {
    marginHorizontal: spacing.lg, marginTop: spacing.sm,
    padding: spacing.lg, backgroundColor: colors.surface2, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  fieldLabel: { color: colors.onSurface3, fontSize: 11, letterSpacing: 1.5, fontWeight: "800", marginBottom: 6, marginTop: spacing.md },
  input: {
    backgroundColor: colors.surface, color: colors.onSurface,
    paddingHorizontal: spacing.md, paddingVertical: 12, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, fontSize: 15,
  },
  feedback: { fontSize: 13, marginTop: spacing.md },
  submitBtn: {
    marginTop: spacing.lg, backgroundColor: colors.brand, paddingVertical: 14,
    borderRadius: radius.md, alignItems: "center", justifyContent: "center",
  },
  submitText: { color: colors.onSurface, fontWeight: "800", letterSpacing: 1.2, fontSize: 13 },
  logoutBtn: {
    flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center",
    marginTop: spacing.xl, marginHorizontal: spacing.lg, paddingVertical: 14,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.brand2,
  },
  logoutText: { color: colors.brand2, fontWeight: "800", letterSpacing: 1.5, fontSize: 13 },
});
