import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { colors, spacing, radius, displayStyle } from "@/src/theme";
import { api } from "@/src/api";

type Plan = { plan_id: string; name: string; duration_months: number; price_inr: number; description: string };

export default function Checkout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { plan_id } = useLocalSearchParams<{ plan_id: string }>();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [config, setConfig] = useState<{ razorpay_enabled: boolean }>({ razorpay_enabled: false });
  const [feedback, setFeedback] = useState<{ kind: "success" | "error" | "info"; msg: string } | null>(null);

  useEffect(() => {
    Promise.all([
      api<Plan[]>("/plans").then(ps => setPlan(ps.find(p => p.plan_id === plan_id) || null)),
      api<{ razorpay_enabled: boolean }>("/payments/config").then(setConfig),
    ]).finally(() => setLoading(false));
  }, [plan_id]);

  const handleOnline = async () => {
    if (!config.razorpay_enabled) {
      setFeedback({
        kind: "info",
        msg: "Online payments aren't configured yet. Please choose 'Pay Cash at Gym' — manager will record your entry on receipt.",
      });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      // Razorpay flow placeholder — real flow opens WebView with Razorpay Checkout
      await api("/payments/order", { method: "POST", body: JSON.stringify({ plan_id }) });
      setFeedback({ kind: "info", msg: "Online payment integration ready. Razorpay checkout will open here once test keys are added." });
    } catch (e: any) {
      setFeedback({ kind: "error", msg: e.message || "Order failed" });
    } finally { setBusy(false); }
  };

  const handleCash = () => {
    setFeedback({
      kind: "success",
      msg: "Got it! Visit Paul Fitness Gym, hand the cash to the manager, and your plan will be activated instantly.",
    });
  };

  if (loading || !plan) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="checkout-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="checkout-back">
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>CHECKOUT</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 220 }}>
        <Text style={styles.label}>ORDER SUMMARY</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.lbl}>Plan</Text>
            <Text style={styles.val}>{plan.name.toUpperCase()}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.lbl}>Duration</Text>
            <Text style={styles.val}>{plan.duration_months} {plan.duration_months === 1 ? "month" : "months"}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={[styles.lbl, { fontSize: 14 }]}>TOTAL</Text>
            <Text style={[displayStyle(36), { fontSize: 36, color: colors.brand }]}>
              ₹{plan.price_inr.toLocaleString("en-IN")}
            </Text>
          </View>
        </View>

        {feedback ? (
          <View style={[styles.feedback, feedback.kind === "error" && { borderColor: colors.brand2 },
            feedback.kind === "success" && { borderColor: colors.success }]} testID="checkout-feedback">
            <Ionicons
              name={feedback.kind === "success" ? "checkmark-circle" : feedback.kind === "error" ? "alert-circle" : "information-circle"}
              size={20}
              color={feedback.kind === "success" ? colors.success : feedback.kind === "error" ? colors.brand2 : colors.info}
            />
            <Text style={styles.feedbackText}>{feedback.msg}</Text>
          </View>
        ) : null}

        <Text style={[styles.label, { marginTop: spacing.xl }]}>SELECT PAYMENT</Text>

        <Pressable
          testID="pay-online-button"
          onPress={handleOnline}
          disabled={busy}
          style={({ pressed }) => [styles.payOnline, pressed && { opacity: 0.85 }]}
        >
          {busy ? <ActivityIndicator color={colors.onSurface} /> : (
            <>
              <Ionicons name="card" size={20} color={colors.onSurface} />
              <View style={{ flex: 1 }}>
                <Text style={styles.payTitle}>PAY ONLINE</Text>
                <Text style={styles.paySub}>UPI · Card · Netbanking via Razorpay</Text>
              </View>
              <Ionicons name="arrow-forward" size={18} color={colors.onSurface} />
            </>
          )}
        </Pressable>

        <Pressable
          testID="pay-cash-button"
          onPress={handleCash}
          style={({ pressed }) => [styles.payCash, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="cash" size={20} color={colors.onSurface} />
          <View style={{ flex: 1 }}>
            <Text style={styles.payTitle}>PAY CASH AT GYM</Text>
            <Text style={styles.paySub}>Visit the gym — manager will record payment</Text>
          </View>
          <Ionicons name="arrow-forward" size={18} color={colors.onSurface} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.surface, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: colors.surface,
  },
  headerTitle: { color: colors.onSurface, fontSize: 13, fontWeight: "800", letterSpacing: 1.5 },
  label: { color: colors.onSurface3, fontSize: 11, letterSpacing: 2, fontWeight: "800", marginBottom: spacing.sm },
  card: { backgroundColor: colors.surface2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
  lbl: { color: colors.onSurface3, fontSize: 13 },
  val: { color: colors.onSurface, fontSize: 14, fontWeight: "600" },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  feedback: {
    flexDirection: "row", gap: spacing.sm, alignItems: "flex-start",
    backgroundColor: colors.surface2, borderRadius: radius.md, padding: spacing.md,
    marginTop: spacing.lg, borderWidth: 1, borderColor: colors.info,
  },
  feedbackText: { color: colors.onSurface2, fontSize: 13, flex: 1, lineHeight: 19 },
  payOnline: {
    flexDirection: "row", gap: 12, alignItems: "center",
    backgroundColor: colors.brand, padding: spacing.lg, borderRadius: radius.md, marginBottom: spacing.md,
    minHeight: 68,
  },
  payCash: {
    flexDirection: "row", gap: 12, alignItems: "center",
    backgroundColor: colors.surface3, padding: spacing.lg, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.borderStrong, minHeight: 68,
  },
  payTitle: { color: colors.onSurface, fontWeight: "800", fontSize: 14, letterSpacing: 1 },
  paySub: { color: colors.onSurface2, fontSize: 12, marginTop: 2 },
});
