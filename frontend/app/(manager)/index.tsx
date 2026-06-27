import React, { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput,
  ActivityIndicator, RefreshControl, FlatList,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { colors, spacing, radius, displayStyle } from "@/src/theme";
import { api } from "@/src/api";

type Member = {
  user_id: string; name: string; email: string; phone?: string | null; picture?: string | null;
  status: "active" | "expiring" | "expired" | "none";
  days_remaining: number | null;
  current_plan: { plan_name: string; expires_at: string } | null;
};

type Stats = { total: number; active: number; expiring: number; expired: number };

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "ALL" },
  { key: "active", label: "ACTIVE" },
  { key: "expiring", label: "EXPIRING" },
  { key: "expired", label: "EXPIRED" },
  { key: "none", label: "NO PLAN" },
];

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  active: { bg: "rgba(46,125,50,0.18)", fg: colors.success },
  expiring: { bg: "rgba(245,127,23,0.18)", fg: colors.warning },
  expired: { bg: "rgba(198,40,40,0.20)", fg: colors.brand2 },
  none: { bg: "rgba(140,140,140,0.18)", fg: colors.muted },
};

export default function ManagerMembers() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      const [m, s] = await Promise.all([
        api<Member[]>(`/manager/members${query ? `?q=${encodeURIComponent(query)}` : ""}`),
        api<Stats>("/manager/stats"),
      ]);
      setMembers(m);
      setStats(s);
    } catch { /* silently ignore — likely 401 during logout */ } finally {
      setLoading(false);
    }
  }, [query]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const filtered = filter === "all" ? members : members.filter(m => m.status === filter);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="manager-members-screen">
      {/* Sticky header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Text style={[displayStyle(24), { fontSize: 24 }]}>COMMAND CENTER</Text>
        <Text style={styles.subtitle}>Members overview</Text>

        {/* Stats */}
        {stats ? (
          <View style={styles.statsRow}>
            <Stat label="TOTAL" value={stats.total} color={colors.onSurface} />
            <Stat label="ACTIVE" value={stats.active} color={colors.success} />
            <Stat label="EXPIRING" value={stats.expiring} color={colors.warning} />
            <Stat label="EXPIRED" value={stats.expired} color={colors.brand2} />
          </View>
        ) : null}

        {/* Search */}
        <View style={styles.searchRow}>
          <Ionicons name="search" size={16} color={colors.muted} />
          <TextInput
            testID="member-search-input"
            placeholder="Search by name, email or phone"
            placeholderTextColor={colors.muted}
            value={query}
            onChangeText={setQuery}
            style={styles.searchInput}
            returnKeyType="search"
          />
        </View>

        {/* Filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.md }}
          style={{ height: 56 }}
        >
          {FILTERS.map(f => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                testID={`filter-${f.key}`}
                onPress={() => setFilter(f.key)}
                style={[styles.chip, { flexShrink: 0 }, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* List */}
      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.xl }} />
      ) : filtered.length === 0 ? (
        <View style={styles.empty} testID="empty-members">
          <Ionicons name="people-outline" size={48} color={colors.muted} />
          <Text style={styles.emptyText}>NO MEMBERS FOUND</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.user_id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120, gap: spacing.sm }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
          renderItem={({ item }) => {
            const sc = STATUS_COLORS[item.status];
            return (
              <Pressable
                testID={`member-row-${item.user_id}`}
                onPress={() => router.push({ pathname: "/member-detail/[id]", params: { id: item.user_id } })}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
              >
                {item.picture ? (
                  <Image source={{ uri: item.picture }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, { backgroundColor: colors.surface3, alignItems: "center", justifyContent: "center" }]}>
                    <Ionicons name="person" color={colors.onSurface2} size={18} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.memberMeta} numberOfLines={1}>
                    {item.phone ? item.phone : item.email}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <View style={[styles.statusPill, { backgroundColor: sc.bg }]}>
                    <Text style={[styles.statusText, { color: sc.fg }]}>
                      {item.status === "none" ? "NO PLAN" : item.status.toUpperCase()}
                    </Text>
                  </View>
                  {item.days_remaining !== null ? (
                    <Text style={styles.daysText}>
                      {item.days_remaining >= 0 ? `${item.days_remaining}d left` : `${Math.abs(item.days_remaining)}d ago`}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {/* Floating Add Member button */}
      <Pressable
        testID="add-member-fab"
        onPress={() => router.push("/add-member")}
        style={({ pressed }) => [styles.fab, { bottom: insets.bottom + 80 }, pressed && { opacity: 0.85 }]}
      >
        <Ionicons name="person-add" size={20} color={colors.onSurface} />
        <Text style={styles.fabText}>ADD MEMBER</Text>
      </Pressable>
    </View>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={[displayStyle(20), { fontSize: 22, color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg, paddingBottom: 0, backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  subtitle: { color: colors.onSurface3, marginTop: 2, fontSize: 12 },
  statsRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.md },
  statBox: { flex: 1, backgroundColor: colors.surface2, padding: spacing.sm, borderRadius: radius.md, alignItems: "center" },
  statLabel: { color: colors.onSurface3, fontSize: 10, letterSpacing: 1, marginTop: 2 },
  searchRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: colors.surface2, paddingHorizontal: spacing.md,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md,
  },
  searchInput: { flex: 1, color: colors.onSurface, paddingVertical: 12, fontSize: 14 },
  chip: {
    height: 36, paddingHorizontal: 14, borderRadius: radius.pill,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    justifyContent: "center", alignItems: "center",
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { color: colors.onSurface3, fontWeight: "800", fontSize: 11, letterSpacing: 1.2 },
  chipTextActive: { color: colors.onSurface },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surface2, padding: spacing.md, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  memberName: { color: colors.onSurface, fontWeight: "700", fontSize: 14 },
  memberMeta: { color: colors.onSurface3, fontSize: 12, marginTop: 2 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm },
  statusText: { fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  daysText: { color: colors.muted, fontSize: 11, marginTop: 4 },
  empty: { alignItems: "center", paddingTop: spacing.xxxl, gap: spacing.md },
  emptyText: { color: colors.muted, fontWeight: "800", letterSpacing: 2, fontSize: 12 },
  fab: {
    position: "absolute", right: spacing.lg,
    backgroundColor: colors.brand, paddingHorizontal: 16, paddingVertical: 12,
    borderRadius: radius.pill, flexDirection: "row", alignItems: "center", gap: 6,
    shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 8,
  },
  fabText: { color: colors.onSurface, fontWeight: "800", letterSpacing: 1, fontSize: 12 },
});
