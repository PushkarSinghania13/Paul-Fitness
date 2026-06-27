import React, { useState } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { colors, spacing, radius, displayStyle } from "@/src/theme";
import { api } from "@/src/api";

export default function AddMember() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkedInfo, setLinkedInfo] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    setLinkedInfo(null);
    if (!name.trim() || !phone.trim()) {
      setError("Name and phone are required.");
      return;
    }
    setBusy(true);
    try {
      const r = await api<{ user: { user_id: string; name: string }; linked: boolean }>("/manager/members", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
        }),
      });
      if (r.linked) {
        setLinkedInfo(
          `This phone already belongs to ${r.user.name}'s account. Future cash payments will show up directly in their app.`
        );
        // Brief pause so manager reads the linking message, then navigate.
        setTimeout(() => {
          router.replace({ pathname: "/member-detail/[id]", params: { id: r.user.user_id } });
        }, 1500);
      } else {
        router.replace({ pathname: "/member-detail/[id]", params: { id: r.user.user_id } });
      }
    } catch (e: any) {
      setError(e.message || "Failed to add member");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.surface }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="add-member-back">
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>ADD WALK-IN MEMBER</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }} keyboardShouldPersistTaps="handled">
        <Text style={[displayStyle(32), { fontSize: 32, marginBottom: spacing.xs }]}>NEW MEMBER</Text>
        <Text style={styles.subtitle}>For members who joined at the gym without the app.</Text>

        <View style={styles.field}>
          <Text style={styles.label}>FULL NAME *</Text>
          <TextInput
            testID="walkin-name-input"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Rohit Sharma"
            placeholderTextColor={colors.muted}
            style={styles.input}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>PHONE NUMBER *</Text>
          <TextInput
            testID="walkin-phone-input"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="e.g. 9876543210"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>EMAIL (OPTIONAL)</Text>
          <TextInput
            testID="walkin-email-input"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="member@example.com"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
          <Text style={styles.hint}>Leave blank if member doesn&apos;t have an email — we&apos;ll generate a placeholder.</Text>
        </View>

        {error ? <Text style={styles.error} testID="add-member-error">{error}</Text> : null}
        {linkedInfo ? (
          <View style={styles.linkedBanner} testID="linked-banner">
            <Ionicons name="link" size={18} color={colors.success} />
            <Text style={styles.linkedText}>{linkedInfo}</Text>
          </View>
        ) : null}

        <Pressable
          testID="add-member-submit"
          onPress={onSubmit}
          disabled={busy}
          style={({ pressed }) => [styles.submitBtn, pressed && { opacity: 0.85 }]}
        >
          {busy ? <ActivityIndicator color={colors.onSurface} /> : (
            <>
              <Ionicons name="person-add" size={18} color={colors.onSurface} />
              <Text style={styles.submitText}>CREATE MEMBER</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: colors.surface,
  },
  headerTitle: { color: colors.onSurface, fontSize: 13, fontWeight: "800", letterSpacing: 1.5 },
  subtitle: { color: colors.onSurface3, marginBottom: spacing.xl, fontSize: 13 },
  field: { marginBottom: spacing.lg },
  label: { color: colors.onSurface3, fontSize: 11, letterSpacing: 1.5, marginBottom: 8, fontWeight: "800" },
  input: {
    backgroundColor: colors.surface2, color: colors.onSurface, paddingHorizontal: spacing.md,
    paddingVertical: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, fontSize: 15,
  },
  hint: { color: colors.muted, fontSize: 11, marginTop: 6 },
  error: { color: colors.brand2, marginBottom: spacing.md, fontSize: 13 },
  linkedBanner: {
    flexDirection: "row", gap: 10, alignItems: "flex-start",
    backgroundColor: "rgba(46,125,50,0.15)", borderWidth: 1, borderColor: colors.success,
    padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.md,
  },
  linkedText: { color: colors.onSurface, fontSize: 13, flex: 1, lineHeight: 19 },
  submitBtn: {
    flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.brand, paddingVertical: 16, borderRadius: radius.md, marginTop: spacing.md,
  },
  submitText: { color: colors.onSurface, fontWeight: "800", letterSpacing: 1.2, fontSize: 14 },
});
