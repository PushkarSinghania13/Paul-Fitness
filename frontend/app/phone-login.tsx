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
import { useAuth } from "@/src/auth";

export default function PhoneLogin() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setSession } = useAuth();

  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendOtp = async () => {
    setError(null);
    if (phone.replace(/\D/g, "").length < 7) {
      setError("Enter a valid phone number");
      return;
    }
    setBusy(true);
    try {
      const r = await api<{ ok: boolean; dev_otp?: string }>("/auth/phone/request-otp", {
        method: "POST",
        body: JSON.stringify({ phone: phone.trim() }),
      });
      setDevOtp(r.dev_otp || null);
      setStep("otp");
    } catch (e: any) {
      setError(e.message || "Failed to send OTP");
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async () => {
    setError(null);
    if (code.length !== 6) {
      setError("Enter the 6-digit code");
      return;
    }
    setBusy(true);
    try {
      const r = await api<{ session_token: string }>("/auth/phone/verify-otp", {
        method: "POST",
        body: JSON.stringify({ phone: phone.trim(), code: code.trim(), name: name.trim() || undefined }),
      });
      await setSession(r.session_token);
      // Routing decision now lives in RootNav (sends to /complete-profile if name missing).
    } catch (e: any) {
      setError(e.message || "Invalid OTP");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setCode("");
    setError(null);
    await sendOtp();
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.surface }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable
          onPress={() => (step === "otp" ? setStep("phone") : router.back())}
          hitSlop={12}
          testID="phone-login-back"
        >
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>PHONE LOGIN</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 100 }} keyboardShouldPersistTaps="handled">
        {step === "phone" ? (
          <>
            <Text style={[displayStyle(36), { fontSize: 36, marginBottom: spacing.xs }]}>YOUR{"\n"}NUMBER</Text>
            <Text style={styles.subtitle}>We&apos;ll send a 6-digit code to verify it&apos;s really you.</Text>

            <Text style={styles.label}>PHONE NUMBER</Text>
            <TextInput
              testID="phone-input"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="e.g. 9876543210"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />

            <Text style={[styles.label, { marginTop: spacing.lg }]}>YOUR NAME (OPTIONAL)</Text>
            <TextInput
              testID="phone-name-input"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              placeholder="What should the gym call you?"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
            <Text style={styles.hint}>Skip if you&apos;re returning — we already have it.</Text>

            {error ? <Text style={styles.error} testID="phone-login-error">{error}</Text> : null}

            <Pressable
              testID="send-otp-button"
              onPress={sendOtp}
              disabled={busy}
              style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
            >
              {busy ? <ActivityIndicator color={colors.onSurface} /> : <Text style={styles.primaryBtnText}>SEND OTP</Text>}
            </Pressable>
          </>
        ) : (
          <>
            <Text style={[displayStyle(36), { fontSize: 36, marginBottom: spacing.xs }]}>ENTER{"\n"}CODE</Text>
            <Text style={styles.subtitle}>We sent a code to {phone}.</Text>

            {devOtp ? (
              <View style={styles.devBanner} testID="dev-otp-banner">
                <Ionicons name="information-circle" size={18} color={colors.warning} />
                <Text style={styles.devBannerText}>
                  MOCK SMS — your OTP is <Text style={styles.devCode}>{devOtp}</Text>. Plug in Twilio to send a real SMS.
                </Text>
              </View>
            ) : null}

            <Text style={styles.label}>6-DIGIT CODE</Text>
            <TextInput
              testID="otp-input"
              value={code}
              onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
              keyboardType="number-pad"
              placeholder="••••••"
              placeholderTextColor={colors.muted}
              style={[styles.input, { letterSpacing: 8, fontSize: 22, textAlign: "center" }]}
              maxLength={6}
            />

            {error ? <Text style={styles.error} testID="phone-login-error">{error}</Text> : null}

            <Pressable
              testID="verify-otp-button"
              onPress={verifyOtp}
              disabled={busy}
              style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
            >
              {busy ? <ActivityIndicator color={colors.onSurface} /> : <Text style={styles.primaryBtnText}>VERIFY & SIGN IN</Text>}
            </Pressable>

            <Pressable testID="resend-otp" onPress={resend} disabled={busy} style={{ marginTop: spacing.md, alignSelf: "center" }}>
              <Text style={styles.resend}>Didn&apos;t get it? Resend OTP</Text>
            </Pressable>
          </>
        )}
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
  subtitle: { color: colors.onSurface3, marginBottom: spacing.xl, fontSize: 14 },
  label: { color: colors.onSurface3, fontSize: 11, letterSpacing: 1.5, marginBottom: 8, fontWeight: "800" },
  input: {
    backgroundColor: colors.surface2, color: colors.onSurface, paddingHorizontal: spacing.md,
    paddingVertical: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, fontSize: 15,
  },
  hint: { color: colors.muted, fontSize: 11, marginTop: 6 },
  error: { color: colors.brand2, marginTop: spacing.md, fontSize: 13 },
  devBanner: {
    flexDirection: "row", gap: 10, alignItems: "flex-start",
    backgroundColor: "rgba(245,127,23,0.12)", borderColor: colors.warning, borderWidth: 1,
    padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.lg,
  },
  devBannerText: { color: colors.onSurface, fontSize: 13, flex: 1 },
  devCode: { fontWeight: "900", letterSpacing: 2, color: colors.warning },
  primaryBtn: {
    backgroundColor: colors.brand, paddingVertical: 16, borderRadius: radius.md,
    alignItems: "center", justifyContent: "center", marginTop: spacing.xl, minHeight: 52,
  },
  primaryBtnText: { color: colors.onSurface, fontWeight: "800", letterSpacing: 1.5, fontSize: 14 },
  resend: { color: colors.brand2, fontSize: 13, fontWeight: "700" },
});
