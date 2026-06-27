import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { colors, spacing, radius, displayStyle } from "@/src/theme";
import { api } from "@/src/api";

type Plan = {
  plan_id: string; name: string; duration_months: number; price_inr: number; description: string;
};

const SAVINGS_BADGE: Record<string, string> = {
  plan_3m: "SAVE ₹500",
  plan_6m: "SAVE ₹1500",
  plan_12m: "BEST VALUE",
};

export default function Plans() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    api<Plan[]>("/plans").then(setPlans).finally(() => setLoading(false));
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="plans-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Text style={[displayStyle(28), { fontSize: 28 }]}>MEMBERSHIP PLANS</Text>
        <Text style={styles.sub}>Choose your training commitment.</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.xxl }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120, gap: spacing.md }}>
          {plans.map((p) => {
            const isSelected = selected === p.plan_id;
            return (
              <Pressable
                key={p.plan_id}
                testID={`plan-${p.plan_id}`}
                onPress={() => setSelected(p.plan_id)}
                style={({ pressed }) => [
                  styles.card,
                  isSelected && styles.cardSelected,
                  pressed && { opacity: 0.9 },
                ]}
              >
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.planName}>{p.name.toUpperCase()}</Text>
                    <Text style={styles.duration}>{p.duration_months} {p.duration_months === 1 ? "MONTH" : "MONTHS"}</Text>
                  </View>
                  {SAVINGS_BADGE[p.plan_id] ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{SAVINGS_BADGE[p.plan_id]}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.desc}>{p.description}</Text>
                <View style={styles.priceRow}>
                  <Text style={[displayStyle(36), { fontSize: 36, color: isSelected ? colors.brand : colors.onSurface }]}>
                    ₹{p.price_inr.toLocaleString("en-IN")}
                  </Text>
                  <Text style={styles.perMonth}>
                    ₹{Math.round(p.price_inr / p.duration_months).toLocaleString("en-IN")}/mo
                  </Text>
                </View>
                {isSelected ? (
                  <View style={styles.selectedTag}>
                    <Ionicons name="checkmark-circle" size={16} color={colors.brand} />
                    <Text style={styles.selectedText}>SELECTED</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {selected ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <Pressable
            testID="continue-cta"
            onPress={() => router.push({ pathname: "/checkout", params: { plan_id: selected } })}
            style={({ pressed }) => [styles.continueBtn, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.continueText}>CONTINUE TO CHECKOUT</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.onSurface} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: colors.surface },
  sub: { color: colors.onSurface3, marginTop: 4, fontSize: 13 },
  card: {
    backgroundColor: colors.surface2, borderRadius: radius.lg, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  cardSelected: { borderColor: colors.brand, backgroundColor: "rgba(215,38,56,0.08)" },
  cardTop: { flexDirection: "row", alignItems: "center", marginBottom: spacing.sm },
  planName: { ...displayStyle(20), fontSize: 20 },
  duration: { color: colors.onSurface3, fontSize: 12, letterSpacing: 1, marginTop: 2 },
  badge: { backgroundColor: colors.brand, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  badgeText: { color: colors.onSurface, fontWeight: "800", fontSize: 10, letterSpacing: 0.8 },
  desc: { color: colors.onSurface2, fontSize: 13, marginBottom: spacing.md },
  priceRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  perMonth: { color: colors.muted, fontSize: 12, marginBottom: 6 },
  selectedTag: { flexDirection: "row", gap: 6, marginTop: spacing.sm, alignItems: "center" },
  selectedText: { color: colors.brand, fontWeight: "800", fontSize: 12, letterSpacing: 1 },
  footer: {
    position: "absolute", left: 0, right: 0, bottom: 64,
    backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  continueBtn: {
    backgroundColor: colors.brand, paddingVertical: 16, borderRadius: radius.md,
    flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8,
  },
  continueText: { color: colors.onSurface, fontWeight: "800", letterSpacing: 1, fontSize: 14 },
});
