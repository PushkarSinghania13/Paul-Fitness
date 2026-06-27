import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, Linking,
  RefreshControl, ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { colors, spacing, radius, displayStyle } from "@/src/theme";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";

const GALLERY = [
  "https://images.pexels.com/photos/29392549/pexels-photo-29392549.jpeg",
  "https://images.unsplash.com/photo-1637430308606-86576d8fef3c",
  "https://images.pexels.com/photos/17626039/pexels-photo-17626039.jpeg",
  "https://images.pexels.com/photos/29392546/pexels-photo-29392546.jpeg",
];

type GymInfo = { name: string; address: string; phone: string };
type Membership = {
  plan_name: string; expires_at: string; status: string;
  duration_months: number; amount: number;
} | null;

function daysBetween(end: string): number {
  const ms = new Date(end).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export default function Home() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [gym, setGym] = useState<GymInfo | null>(null);
  const [membership, setMembership] = useState<Membership>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [g, m] = await Promise.all([
        api<GymInfo>("/gym-info"),
        api<{ current: Membership }>("/memberships/me"),
      ]);
      setGym(g);
      setMembership(m.current);
    } catch { /* silently ignore — likely 401 during logout */ } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([load(), refresh()]);
    setRefreshing(false);
  };

  const callGym = () => {
    if (gym?.phone) Linking.openURL(`tel:${gym.phone}`);
  };

  const daysLeft = membership ? daysBetween(membership.expires_at) : null;
  const isActive = membership && daysLeft !== null && daysLeft >= 0;
  const isExpiring = isActive && (daysLeft as number) <= 5;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="user-home-screen">
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: spacing.xxxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>HELLO,</Text>
            <Text style={styles.username} numberOfLines={1}>
              {(user?.name || "ATHLETE").toUpperCase()}
            </Text>
          </View>
          {user?.picture ? (
            <Image source={{ uri: user.picture }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: colors.surface3, alignItems: "center", justifyContent: "center" }]}>
              <Ionicons name="person" color={colors.onSurface2} size={22} />
            </View>
          )}
        </View>

        {/* Plan Status Card */}
        {loading ? (
          <View style={[styles.statusCard, { alignItems: "center" }]}>
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : isActive ? (
          <View style={[styles.statusCard, { borderColor: isExpiring ? colors.warning : colors.brand }]} testID="active-plan-card">
            <Text style={styles.cardLabel}>DAYS REMAINING</Text>
            <Text style={[displayStyle(96), { color: isExpiring ? colors.warning : colors.brand, lineHeight: 96 }]}>
              {daysLeft}
            </Text>
            <Text style={styles.cardMeta}>
              {membership?.plan_name?.toUpperCase()} · Expires {new Date(membership!.expires_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
            </Text>
            {isExpiring ? (
              <View style={styles.warnBanner}>
                <Ionicons name="warning" size={16} color={colors.warning} />
                <Text style={styles.warnText}>Plan expiring soon. Renew to keep training.</Text>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={[styles.statusCard, { borderColor: colors.brand }]} testID="no-plan-card">
            <Text style={styles.cardLabel}>STATUS</Text>
            <Text style={[displayStyle(48), { color: colors.brand }]}>NO ACTIVE{"\n"}PLAN</Text>
            <Text style={styles.cardMeta}>Choose a plan to start training.</Text>
            <Pressable
              testID="view-plans-cta"
              onPress={() => router.push("/(user)/plans")}
              style={({ pressed }) => [styles.cardCta, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.cardCtaText}>VIEW PLANS</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.onSurface} />
            </Pressable>
          </View>
        )}

        {/* Quick actions */}
        {isActive ? (
          <Pressable
            testID="renew-cta"
            onPress={() => router.push("/(user)/plans")}
            style={({ pressed }) => [styles.renewBtn, pressed && { opacity: 0.85 }]}
          >
            <Ionicons name="refresh" size={18} color={colors.onSurface} />
            <Text style={styles.renewText}>EXTEND / RENEW PLAN</Text>
          </Pressable>
        ) : null}

        {/* Gym Info */}
        <Text style={styles.sectionTitle}>THE GYM</Text>
        <View style={styles.infoCard}>
          <Text style={styles.gymName}>{gym?.name || "PAUL FITNESS GYM"}</Text>
          <View style={styles.row}>
            <Ionicons name="location" size={16} color={colors.brand} />
            <Text style={styles.infoText}>{gym?.address || "Raghunathpur, West Bengal"}</Text>
          </View>
          <Pressable onPress={callGym} style={styles.callBtn} testID="call-gym-button">
            <Ionicons name="call" size={16} color={colors.onSurface} />
            <Text style={styles.callBtnText}>{gym?.phone || "079082 83507"}</Text>
          </Pressable>
        </View>

        {/* Gallery */}
        <Text style={styles.sectionTitle}>GALLERY</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.md }}
        >
          {GALLERY.map((uri) => (
            <Image key={uri} source={{ uri }} style={styles.gallery} contentFit="cover" />
          ))}
        </ScrollView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", padding: spacing.lg, paddingBottom: spacing.md,
  },
  greeting: { color: colors.onSurface3, fontSize: 11, letterSpacing: 1.5, fontWeight: "700" },
  username: { ...displayStyle(28), fontSize: 28, marginTop: 2 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  statusCard: {
    marginHorizontal: spacing.lg, padding: spacing.lg,
    backgroundColor: colors.surface2, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.brand,
  },
  cardLabel: { color: colors.onSurface3, fontSize: 11, letterSpacing: 2, fontWeight: "700" },
  cardMeta: { color: colors.onSurface2, marginTop: spacing.sm, fontSize: 13 },
  cardCta: {
    flexDirection: "row", gap: 8, marginTop: spacing.lg, alignSelf: "flex-start",
    backgroundColor: colors.brand, paddingHorizontal: spacing.lg, paddingVertical: 12, borderRadius: radius.md,
    alignItems: "center",
  },
  cardCtaText: { color: colors.onSurface, fontWeight: "800", letterSpacing: 1, fontSize: 13 },
  warnBanner: {
    flexDirection: "row", gap: 8, alignItems: "center",
    marginTop: spacing.md, padding: spacing.sm,
    backgroundColor: "rgba(245,127,23,0.12)", borderRadius: radius.sm,
  },
  warnText: { color: colors.warning, fontSize: 12, flex: 1 },
  renewBtn: {
    marginHorizontal: spacing.lg, marginTop: spacing.md, backgroundColor: colors.brand,
    paddingVertical: 14, borderRadius: radius.md,
    flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8,
  },
  renewText: { color: colors.onSurface, fontWeight: "800", letterSpacing: 1, fontSize: 13 },
  sectionTitle: {
    color: colors.onSurface3, fontSize: 11, letterSpacing: 2, fontWeight: "800",
    marginTop: spacing.xl, marginBottom: spacing.md, paddingHorizontal: spacing.lg,
  },
  infoCard: {
    marginHorizontal: spacing.lg, padding: spacing.lg, backgroundColor: colors.surface2,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.sm,
  },
  gymName: { ...displayStyle(20), fontSize: 20, color: colors.onSurface },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  infoText: { color: colors.onSurface2, fontSize: 13, flex: 1 },
  callBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.md, paddingVertical: 10,
    borderRadius: radius.md, alignSelf: "flex-start", marginTop: 4,
  },
  callBtnText: { color: colors.onSurface, fontWeight: "700", fontSize: 13 },
  gallery: { width: 240, height: 160, borderRadius: radius.lg, backgroundColor: colors.surface2 },
});
