import React, { useState } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
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
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkedInfo, setLinkedInfo] = useState<string | null>(null);

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
    Alert.alert("Add Photo", "Choose an option", [
      { text: "Take Photo", onPress: takePhoto },
      { text: "Choose from Library", onPress: pickPhoto },
      { text: "Cancel", style: "cancel" },
    ]);
  };

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
          picture: photo || undefined,
        }),
      });
      if (r.linked) {
        setLinkedInfo(
          `This phone already belongs to ${r.user.name}'s account. Future cash payments will show up directly in their app.`
        );
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
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>ADD WALK-IN MEMBER</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }} keyboardShouldPersistTaps="handled">
        <Text style={[displayStyle(32), { fontSize: 32, marginBottom: spacing.xs }]}>NEW MEMBER</Text>
        <Text style={styles.subtitle}>For members who joined at the gym without the app.</Text>

        {/* Photo Picker */}
        <View style={styles.photoSection}>
          <Pressable onPress={onPhotoPress} style={({ pressed }) => [styles.photoBtn, pressed && { opacity: 0.8 }]}>
            {photo ? (
              <Image source={{ uri: photo }} style={styles.photoPreview} />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Ionicons name="camera" size={28} color={colors.muted} />
                <Text style={styles.photoHint}>ADD PHOTO</Text>
              </View>
            )}
          </Pressable>
          {photo ? (
            <Pressable onPress={() => setPhoto(null)} style={styles.removePhoto}>
              <Ionicons name="close-circle" size={20} color={colors.brand2} />
              <Text style={styles.removePhotoText}>REMOVE</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>FULL NAME *</Text>
          <TextInput
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
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="member@example.com"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {linkedInfo ? (
          <View style={styles.linkedBanner}>
            <Ionicons name="link" size={18} color={colors.success} />
            <Text style={styles.linkedText}>{linkedInfo}</Text>
          </View>
        ) : null}

        <Pressable
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
  photoSection: { alignItems: "center", marginBottom: spacing.xl },
  photoBtn: { width: 100, height: 100, borderRadius: 50, overflow: "hidden" },
  photoPreview: { width: 100, height: 100, borderRadius: 50 },
  photoPlaceholder: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: colors.surface2, borderWidth: 2, borderColor: colors.border,
    borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 4,
  },
  photoHint: { color: colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  removePhoto: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.sm },
  removePhotoText: { color: colors.brand2, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
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
  submitBtn: {
    flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.brand, paddingVertical: 16, borderRadius: radius.md, marginTop: spacing.md,
  },
  submitText: { color: colors.onSurface, fontWeight: "800", letterSpacing: 1.2, fontSize: 14 },
});
