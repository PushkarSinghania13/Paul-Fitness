import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator,
  TextInput, KeyboardAvoidingView, Platform, Alert,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
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
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await api<{ history: HistoryItem[] }>("/memberships/me");
      setHistory(r.history);
    } catch { } finally { setLoading(false); }
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

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Please allow access to your photo library.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
      base64: true,
    });
    if (!result.canceled && result.assets[0].base64) {
      await uploadPhoto(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Please allow camera access.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
      base64: true,
    });
    if (!result.canceled && result.assets[0].base64) {
      await uploadPhoto(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const uploadPhoto = async (base64: string) => {
    setSavingPhoto(true);
    try {
      await api("/auth/profile/picture", {
        method: "POST",
        body: JSON.stringify({ picture: base64 }),
      });
      await refresh();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to update photo");
    } finally {
      setSavingPhoto(false);
    }
  };

  const removePhoto = async () => {
    setSavingPhoto(true);
    try {
      await api("/auth/profile/picture", {
        method: "POST",
        body: JSON.stringify({ picture: "" }),
      });
      await refresh();
    } catch { } finally { setSavingPhoto(false); }
  };

  const onPhotoPress = () => {
    Alert.alert("Profile Photo", "Choose an option", [
      { text: "Take Photo", onPress: takePhoto },
      { text: "Choose from Library", onPress: pickPhoto },
      ...(user?.picture ? [{ text: "Remove Photo", onPress: removePhoto, style: "destructive" as const }] : []),
      { text: "Cancel", style: "cancel" },
    ]);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[displayStyle(28), { fontSize: 28, paddingHorizontal: spacing.lg, marginBottom: spacing.lg }]}>PROFILE</Text>

        {/* Profile Card with photo */}
        <View style={styles.profileCard}>
          <Pressable onPress={onPhotoPress} style={styles.avatarWrapper}>
            {savingPhoto ? (
              <View style={[styles.avatar, { backgroundColor: colors.surface3, alignItems: "center", justifyContent: "center" }]}>
                <ActivityIndicator color={colors.brand} />
              </View>
            ) : user?.picture ? (
              <Image source={{ uri: user.picture }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: colors.surface3, alignItems: "center", justifyContent: "center" }]}>
                <Ionicons name="person" color={colors.onSurface2} size={28} />
              </View>
            )}
            {/* Camera badge */}
            <View style={styles.cameraBadge}>
              <Ionicons name="camera" size={12} color={colors.onSurface} />
            </View>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>{user?.name}</Text>
            <Text style={styles.email} numberOfLines={1}>{user?.email}</Text>
            <Pressable onPress={onPhotoPress}>
              <Text style={styles.changePhotoText}>CHANGE PHOTO</Text>
            </Pressable>
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
  avatarWrapper: { position: "relative" },
  avatar: { width: 64, height: 64, borderRadius: 32 },
  cameraBadge: {
    position: "absolute", bottom: 0, right: 0,
    backgroundColor: colors.brand, borderRadius: 10, width: 20, height: 20,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: colors.surface2,
  },
  name: { color: colors.onSurface, fontSize: 17, fontWeight: "700" },
  email: { color: colors.onSurface3, fontSize: 13, marginTop: 2 },
  changePhotoText: { color: colors.brand, fontSize: 11, fontWeight: "800", letterSpacing: 1, marginTop: 6 },
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
