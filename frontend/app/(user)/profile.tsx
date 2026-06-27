import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { colors, spacing, radius, displayStyle } from "@/src/theme";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";

type HistoryItem = {
  membership_id: string; plan_name: string; amount: number;
  started_at: string; expires_at: string; payment_method: string; created_at: string;
};

export default function Profile() {
  const insets = useSafeAreaInsets();
  const { user, logout, refresh } = useAuth();
  const [phone, setPhone] = useState(user?.phone || "");
  const [savingPhone, setSavingPhone] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await api<{ history: HistoryItem[] }>("/memberships/me");
      setHistory(r.history);
    } catch { /* silently ignore */ } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { setPhone(user?.phone || ""); }, [user?.phone]);

  const savePhone = async () => {
    setSavingPhone(true);
    try {
      await api("/auth/phone", { method: "POST", body: JSON.stringify({ phone }) });
      await refresh();
    } finally { setSavingPhone(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[displayStyle(28), { fontSize: 28, paddingHorizontal: spacing.lg, marginBottom: spacing.lg }]}>PROFILE</Text>

        <View style={styles.profileCard}>
          {user?.picture ? (
            <Image source={{ uri: user.picture }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: colors.surface3, alignItems: "center", justifyContent: "center" }]}>
              <Ionicons name="person" color={colors.onSurface2} size={28} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>{user?.name}</Text>
            <Text style={styles.email} numberOfLines={1}>{user?.email}</Text>
          </View>
        </View>

        {/* Phone */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>CONTACT NUMBER</Text>
          <Text style={styles.hint}>The manager will call you on this number if your plan expires.</Text>
          <View style={styles.phoneRow}>
            <TextInput
              testID="phone-input"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="e.g. 9876543210"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
            <Pressable
              testID="save-phone-button"
              onPress={savePhone}
              disabled={savingPhone || !phone || phone === user?.phone}
              style={({ pressed }) => [styles.saveBtn, (savingPhone || !phone || phone === user?.phone) && { opacity: 0.5 }, pressed && { opacity: 0.8 }]}
            >
              {savingPhone ? <ActivityIndicator color={colors.onSurface} /> : <Text style={styles.saveBtnText}>SAVE</Text>}
            </Pressable>
          </View>
        </View>

        {/* History */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>PAYMENT HISTORY</Text>
          {loading ? (
            <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.md }} />
          ) : history.length === 0 ? (
            <Text style={styles.empty}>No payments yet.</Text>
          ) : history.map(h => (
            <View key={h.membership_id} style={styles.historyRow} testID={`history-${h.membership_id}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.histPlan}>{h.plan_name.toUpperCase()}</Text>
                <Text style={styles.histMeta}>
                  {new Date(h.started_at).toLocaleDateString("en-IN")} → {new Date(h.expires_at).toLocaleDateString("en-IN")}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.histAmount}>₹{h.amount.toLocaleString("en-IN")}</Text>
                <Text style={[styles.method, { color: h.payment_method === "cash" ? colors.warning : colors.success }]}>
                  {h.payment_method.toUpperCase()}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <Pressable testID="logout-button" onPress={logout} style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.8 }]}>
          <Ionicons name="log-out-outline" size={18} color={colors.brand2} />
          <Text style={styles.logoutText}>LOG OUT</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  profileCard: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    marginHorizontal: spacing.lg, padding: spacing.lg,
    backgroundColor: colors.surface2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
  },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  name: { color: colors.onSurface, fontSize: 17, fontWeight: "700" },
  email: { color: colors.onSurface3, fontSize: 13, marginTop: 2 },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  sectionLabel: { color: colors.onSurface3, fontSize: 11, fontWeight: "800", letterSpacing: 2, marginBottom: spacing.sm },
  hint: { color: colors.muted, fontSize: 12, marginBottom: spacing.sm },
  phoneRow: { flexDirection: "row", gap: spacing.sm },
  input: {
    flex: 1, backgroundColor: colors.surface2, color: colors.onSurface,
    paddingHorizontal: spacing.md, paddingVertical: 12, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, fontSize: 15,
  },
  saveBtn: { backgroundColor: colors.brand, paddingHorizontal: 16, justifyContent: "center", borderRadius: radius.md, minWidth: 70, alignItems: "center" },
  saveBtnText: { color: colors.onSurface, fontWeight: "800", letterSpacing: 1, fontSize: 12 },
  empty: { color: colors.muted, fontSize: 13, marginTop: spacing.sm },
  historyRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  histPlan: { color: colors.onSurface, fontWeight: "700", fontSize: 14, letterSpacing: 0.5 },
  histMeta: { color: colors.onSurface3, fontSize: 12, marginTop: 2 },
  histAmount: { color: colors.onSurface, fontWeight: "800", fontSize: 15 },
  method: { fontSize: 10, fontWeight: "800", letterSpacing: 1, marginTop: 2 },
  logoutBtn: {
    flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center",
    marginTop: spacing.xl, marginHorizontal: spacing.lg, paddingVertical: 14,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.brand2,
  },
  logoutText: { color: colors.brand2, fontWeight: "800", letterSpacing: 1.5, fontSize: 13 },
});
