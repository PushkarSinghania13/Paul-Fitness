import React, { useState } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, radius, displayStyle } from "@/src/theme";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";

export default function CompleteProfile() {
  const insets = useSafeAreaInsets();
  const { user, refresh, logout } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkedNote, setLinkedNote] = useState<string | null>(null);

  const needsName = !user?.name;
  const needsPhone = !user?.phone;
  const needsPhoto = !user?.picture;

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
      setPhoto(`data:image/jpeg;base64,${result.assets[0].base64}`);
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
      setPhoto(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const onPhotoPress = () => {
    Alert.alert("Add Your Photo", "Choose an option", [
      { text: "Take Photo", onPress: takePhoto },
      { text: "Choose from Library", onPress: pickPhoto },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const onSave = async () => {
    setError(null);
    setLinkedNote(null);
    if (needsName && !name.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (needsPhone && phone.replace(/\D/g, "").length < 7) {
      setError("Please enter a valid phone number.");
      return;
    }
    if (needsPhoto && !photo) {
      setError("Please add a profile photo to continue.");
      return;
    }
    setBusy(true);
    try {
      // Only call complete-profile if there's actually a name or phone to update
      if (needsName || needsPhone) {
        const r = await api<{ ok: boolean; merged_memberships: number }>("/auth/complete-profile", {
          method: "POST",
          body: JSON.stringify({
            name: needsName ? name.trim() : undefined,
            phone: needsPhone ? phone.trim() : undefined,
          }),
        });

        if (r.merged_memberships > 0) {
          setLinkedNote(
            `We found ${r.merged_memberships} payment${r.merged_memberships > 1 ? "s" : ""} the manager already recorded for this number — they're now in your account.`
          );
        }
      }

      // Save photo if needed
      if (needsPhoto && photo) {
        await api("/auth/profile/picture", {
          method: "POST",
          body: JSON.stringify({ picture: photo }),
        });
      }

      if (linkedNote) {
        setTimeout(() => refresh(), 1500);
      } else {
        await refresh();
      }
    } catch (e: any) {
      setError(e.message || "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  // Figure out the title based on what's missing
  const title = needsPhoto && !needsPhone && !needsName
    ? "ADD YOUR\nPHOTO"
    : needsPhone
    ? "ADD YOUR\nNUMBER"
    : "WHAT SHOULD\nWE CALL YOU?";

  const subtitle = needsPhoto
    ? "Add a profile photo so the manager can identify you easily at the gym."
    : needsPhone
    ? "The manager will call you if your plan is about to expire — and any cash payments they record for this number will instantly show in your account."
    : "Help us personalize your experience.";

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.surface }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Text style={styles.headerTitle}>ALMOST THERE</Text>
        <Pressable onPress={logout} hitSlop={10} testID="complete-profile-logout">
          <Text style={styles.signout}>SIGN OUT</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 100 }} keyboardShouldPersistTaps="handled">
        <Text style={[displayStyle(36), { fontSize: 36, marginBottom: spacing.xs }]}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        {/* Photo picker — shown if user doesn't have a photo */}
        {needsPhoto ? (
          <View style={styles.photoSection}>
            <Pressable onPress={onPhotoPress} style={({ pressed }) => [styles.photoBtn, pressed && { opacity: 0.85 }]}>
              {photo ? (
                <Image source={{ uri: photo }} style={styles.photoPreview} />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Ionicons name="camera" size={36} color={colors.muted} />
                  <Text style={styles.photoHint}>TAP TO ADD PHOTO</Text>
                </View>
              )}
            </Pressable>
            {photo ? (
              <View style={styles.photoActions}>
                <Pressable onPress={onPhotoPress} style={styles.retakeBtn}>
                  <Ionicons name="refresh" size={14} color={colors.onSurface} />
                  <Text style={styles.retakeText}>RETAKE</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}

        {needsName ? (
          <View style={styles.field}>
            <Text style={styles.label}>FULL NAME</Text>
            <TextInput
              testID="complete-name-input"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              placeholder="e.g. Rohit Sharma"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
          </View>
        ) : null}

        {needsPhone ? (
          <View style={styles.field}>
            <Text style={styles.label}>PHONE NUMBER</Text>
            <TextInput
              testID="complete-phone-input"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="e.g. 9876543210"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
          </View>
        ) : null}

        {error ? <Text style={styles.error} testID="complete-profile-error">{error}</Text> : null}
        {linkedNote ? (
          <View style={styles.linkedBanner} testID="complete-linked-note">
            <Ionicons name="link" size={18} color={colors.success} />
            <Text style={styles.linkedText}>{linkedNote}</Text>
          </View>
        ) : null}

        <Pressable
          testID="complete-save-button"
          onPress={onSave}
          disabled={busy}
          style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
        >
          {busy ? <ActivityIndicator color={colors.onSurface} /> : (
            <>
              <Text style={styles.primaryBtnText}>CONTINUE</Text>
              <Ionicons name="arrow-forward" size={18} color={colors.onSurface} />
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
  signout: { color: colors.brand2, fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  subtitle: { color: colors.onSurface3, marginBottom: spacing.xl, fontSize: 14, lineHeight: 20 },
  photoSection: { alignItems: "center", marginBottom: spacing.xl },
  photoBtn: { width: 140, height: 140, borderRadius: 70, overflow: "hidden" },
  photoPreview: { width: 140, height: 140, borderRadius: 70 },
  photoPlaceholder: {
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: colors.surface2, borderWidth: 2, borderColor: colors.brand,
    borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: spacing.sm,
  },
  photoHint: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1, textAlign: "center" },
  photoActions: { marginTop: spacing.md, flexDirection: "row", gap: spacing.sm },
  retakeBtn: {
    flexDirection: "row", gap: 6, alignItems: "center",
    backgroundColor: colors.surface2, paddingHorizontal: spacing.md, paddingVertical: 8,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border,
  },
  retakeText: { color: colors.onSurface, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  field: { marginBottom: spacing.lg },
  label: { color: colors.onSurface3, fontSize: 11, letterSpacing: 1.5, marginBottom: 8, fontWeight: "800" },
  input: {
    backgroundColor: colors.surface2, color: colors.onSurface, paddingHorizontal: spacing.md,
    paddingVertical: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, fontSize: 15,
  },
  error: { color: colors.brand2, marginBottom: spacing.md, fontSize: 13 },
  linkedBanner: {
    flexDirection: "row", gap: 10, alignItems: "flex-start",
    backgroundColor: "rgba(46,125,50,0.15)", borderWidth: 1, borderColor: colors.success,
    padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.md,
  },
  linkedText: { color: colors.onSurface, fontSize: 13, flex: 1, lineHeight: 19 },
  primaryBtn: {
    flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.brand, paddingVertical: 16, borderRadius: radius.md, marginTop: spacing.md,
  },
  primaryBtnText: { color: colors.onSurface, fontWeight: "800", letterSpacing: 1.5, fontSize: 14 },
});
