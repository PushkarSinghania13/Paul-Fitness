import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, radius, displayStyle } from "@/src/theme";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";

const BG_IMAGE = "https://images.pexels.com/photos/29392546/pexels-photo-29392546.jpeg";

export default function Onboarding() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, loading, setSession } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Web: detect session_id in hash on mount
  useEffect(() => {
    if (Platform.OS !== "web") return;
    try {
      const hash = window.location.hash || "";
      const search = window.location.search || "";
      const m = hash.match(/session_id=([^&]+)/) || search.match(/session_id=([^&]+)/);
      if (m && m[1]) {
        processSessionId(decodeURIComponent(m[1]));
        try { window.history.replaceState(null, "", window.location.pathname); } catch {}
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!loading && user) {
      router.replace(user.role === "manager" ? "/(manager)" : "/(user)");
    }
  }, [user, loading]);

  const processSessionId = async (sessionId: string) => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ session_token: string }>("/auth/google/session", {
        method: "POST",
        body: JSON.stringify({ session_id: sessionId }),
      });
      await setSession(r.session_token);
    } catch (e: any) {
      setError(e.message || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  const onGoogleLogin = async () => {
    setError(null);
    try {
      const redirectUrl = Platform.OS === "web" ? (window.location.origin + "/") : Linking.createURL("auth");
      const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
      if (Platform.OS === "web") {
        window.location.href = authUrl;
        return;
      }
      setBusy(true);
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
      if (result.type === "success" && result.url) {
        const url = result.url;
        const hashMatch = url.match(/[#&?]session_id=([^&]+)/);
        if (hashMatch) {
          await processSessionId(decodeURIComponent(hashMatch[1]));
        } else {
          setError("No session returned");
        }
      }
    } catch (e: any) {
      setError(e.message || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.root, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.root} testID="onboarding-screen">
      <Image source={{ uri: BG_IMAGE }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
      <LinearGradient
        colors={["rgba(18,18,18,0)", "rgba(18,18,18,0.4)", "rgba(18,18,18,0.95)", "#121212"]}
        locations={[0, 0.4, 0.75, 1]}
        style={StyleSheet.absoluteFillObject}
      />

      <View style={[styles.top, { paddingTop: insets.top + spacing.xl }]}>
        <View style={styles.brandBadge}>
          <Ionicons name="barbell" color={colors.brand} size={18} />
          <Text style={styles.brandSmall}>EST. RAGHUNATHPUR</Text>
        </View>
      </View>

      <View style={{ flex: 1 }} />

      <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Text style={[displayStyle(64), styles.title]}>PAUL</Text>
        <Text style={[displayStyle(64), styles.titleBrand]}>FITNESS</Text>
        <Text style={styles.tagline}>Train hard. Stay accountable. Show up daily.</Text>

        {error ? <Text style={styles.error} testID="login-error">{error}</Text> : null}

        <Pressable
          testID="google-login-button"
          onPress={onGoogleLogin}
          disabled={busy}
          style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
        >
          {busy ? (
            <ActivityIndicator color={colors.onSurface} />
          ) : (
            <>
              <Ionicons name="logo-google" size={20} color={colors.onSurface} />
              <Text style={styles.primaryBtnText}>SIGN IN WITH GOOGLE</Text>
            </>
          )}
        </Pressable>

        <Pressable
          testID="phone-login-button"
          onPress={() => router.push("/phone-login")}
          style={({ pressed }) => [styles.phoneBtn, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="call" size={18} color={colors.onSurface} />
          <Text style={styles.phoneBtnText}>CONTINUE WITH PHONE</Text>
        </Pressable>

        <Pressable
          testID="manager-login-button"
          onPress={() => router.push("/manager-login")}
          style={({ pressed }) => [styles.ghostBtn, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="key-outline" size={18} color={colors.onSurface2} />
          <Text style={styles.ghostBtnText}>MANAGER / TRAINER LOGIN</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  top: { paddingHorizontal: spacing.lg, alignItems: "flex-start" },
  brandBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: 6,
    backgroundColor: "rgba(0,0,0,0.45)", borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.borderStrong,
  },
  brandSmall: { color: colors.onSurface, fontSize: 11, letterSpacing: 1.5, fontWeight: "700" },
  bottom: { padding: spacing.xl, paddingBottom: spacing.xl },
  title: { fontSize: 72, lineHeight: 72, color: colors.onSurface },
  titleBrand: { fontSize: 72, lineHeight: 72, color: colors.brand, marginBottom: spacing.sm },
  tagline: { color: colors.onSurface3, fontSize: 14, marginBottom: spacing.xl, letterSpacing: 0.3 },
  error: { color: colors.brand2, marginBottom: spacing.md, fontSize: 13 },
  primaryBtn: {
    backgroundColor: colors.brand, paddingVertical: 16, borderRadius: radius.md,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    marginBottom: spacing.md, minHeight: 52,
  },
  primaryBtnText: { color: colors.onSurface, fontWeight: "800", letterSpacing: 1, fontSize: 14 },
  phoneBtn: {
    backgroundColor: colors.surface3, paddingVertical: 16, borderRadius: radius.md,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    marginBottom: spacing.md, minHeight: 52, borderWidth: 1, borderColor: colors.borderStrong,
  },
  phoneBtnText: { color: colors.onSurface, fontWeight: "800", letterSpacing: 1, fontSize: 14 },
  ghostBtn: {
    paddingVertical: 14, borderRadius: radius.md,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: "transparent",
  },
  ghostBtnText: { color: colors.onSurface2, fontWeight: "700", letterSpacing: 1, fontSize: 13 },
});
